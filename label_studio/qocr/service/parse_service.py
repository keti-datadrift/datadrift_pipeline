import base64
import os
import re
import tempfile
import time
from os import PathLike
from pathlib import Path
from typing import Literal

from loguru import logger
from mineru.cli.common import do_parse, prepare_env, read_fn
from mineru.data.data_reader_writer import FileBasedDataWriter
from mineru.utils.enum_class import ModelInvokeConfigDict

from ..model.entity import OCROutput, ParsePDFOutput


class ParseService:
    def __init__(self, output_dir: str = "/label-studio/output") -> None:
        self.output_dir = Path(output_dir)
        self.local_image_dir = self.output_dir / "images"
        self.local_md_dir = self.output_dir
        self.image_dir = self.local_image_dir.name

        # Create output directories
        self.local_image_dir.mkdir(exist_ok=True)

        # Initialize writers
        self.image_writer = FileBasedDataWriter(str(self.local_image_dir))
        self.md_writer = FileBasedDataWriter(str(self.local_md_dir))

    def process_document(
        self,
        pdf_path: str,
        max_pages: int,
        invoke_config: ModelInvokeConfigDict,
        is_ocr: bool = False,  # OCR 강제 활성화 여부
        formula_enable: bool = False,  # 수식 인식 활성화
        table_enable: bool = False,  # 테이블 인식 활성화
        language: str = "korean",  # 언어 설정
    ) -> OCROutput:
        """Process a PDF document and generate various outputs.

        Args:
            pdf_path: Path to the PDF file
            max_pages: Maximum number of pages to process
            invoke_config: Model configuration dictionary
            is_ocr: Force OCR mode
            formula_enable: Enable formula recognition
            table_enable: Enable table recognition
            language: Language setting

        Returns:
            OCROutput containing processing results
        """
        try:
            # Get file name without suffix for output naming
            name_without_suffix = Path(pdf_path).stem

            # Process PDF to markdown and other outputs
            md_content, txt_content, layout_pdf_path, parse_output = self._process_pdf_to_markdown(
                pdf_path,
                max_pages,
                invoke_config,
                is_ocr,
                formula_enable,
                table_enable,
                language,
            )

            # Generate content list from markdown
            content_list = self._extract_content_list(md_content, name_without_suffix)

            return OCROutput(
                model_pdf=layout_pdf_path,
                markdown=md_content,
                content_list=content_list,
                images_path=parse_output.images_path,
            )

        except Exception as e:
            logger.exception(f"Error processing document {pdf_path}: {str(e)}")
            raise

    def _process_pdf_to_markdown(
        self,
        file_path: str,
        end_pages: int,
        invoke_config: ModelInvokeConfigDict,
        is_ocr: bool,
        formula_enable: bool,
        table_enable: bool,
        language: str,
    ) -> tuple[str, str, str, ParsePDFOutput]:
        """PDF를 Markdown으로 변환하는 메인 함수"""
        # PDF 분석 및 변환
        temp_dir = Path(tempfile.mkdtemp())
        parse_output = self._parse_pdf(
            file_path,
            temp_dir,
            end_pages - 1 if end_pages > 0 else -1,
            invoke_config,
            is_ocr,
            formula_enable,
            table_enable,
            language,
        )

        # Markdown 파일 읽기
        if not os.path.exists(parse_output.markdown):
            logger.warning(f"Markdown 파일을 찾을 수 없습니다: {parse_output.markdown}")
            txt_content = ""
        else:
            with open(parse_output.markdown, "r", encoding="utf-8") as f:
                txt_content = f.read()

        # 이미지를 base64로 변환한 Markdown 생성
        md_content = self._replace_image_with_base64(txt_content, parse_output.images_path)

        # 레이아웃이 그려진 PDF 경로 확인
        layout_pdf_path = parse_output.layout_pdf
        if not os.path.exists(layout_pdf_path):
            # 대체 경로들 시도
            alternative_paths = [parse_output.model_pdf, parse_output.origin_pdf]
            for alt_path in alternative_paths:
                if os.path.exists(alt_path):
                    layout_pdf_path = alt_path
                    break
            else:
                logger.warning(f"Layout PDF를 찾을 수 없습니다: {layout_pdf_path}")
                layout_pdf_path = ""

        return md_content, txt_content, layout_pdf_path, parse_output

    def _parse_pdf(
        self,
        doc_path: str,
        output_dir: PathLike,
        end_page_id: int,
        invoke_config: ModelInvokeConfigDict,
        is_ocr: bool,
        formula_enable: bool,
        table_enable: bool,
        language: str,
    ) -> ParsePDFOutput:
        """
        Parse PDF using mineru

        Returns: ParsePDFOutput
        """
        os.makedirs(output_dir, exist_ok=True)

        file_name = f"{str(Path(doc_path).stem)}_{time.strftime('%y%m%d_%H%M%S')}"
        pdf_data = read_fn(doc_path)

        parse_method = "ocr" if is_ocr else "auto"
        local_image_dir, local_md_dir = prepare_env(str(output_dir), file_name, parse_method)

        do_parse(
            output_dir=str(output_dir),
            pdf_file_names=[file_name],
            pdf_bytes_list=[pdf_data],
            p_lang_list=[language],
            parse_method=parse_method,
            invoke_config=invoke_config,
            end_page_id=end_page_id,
            p_formula_enable=formula_enable,
            p_table_enable=table_enable,
        )

        # mineru의 출력 구조에 맞게 경로 설정
        complete_path = Path(local_md_dir)

        def make_filename(id: str, suffix: str | None, ext: Literal["json", "md", "pdf"]) -> str:
            if suffix:
                return f"{id}_{suffix}.{ext}"
            return f"{id}.{ext}"

        return ParsePDFOutput(
            output_path=str(output_dir),
            parse_id=file_name,
            complete_path=str(complete_path),
            images_path=str(local_image_dir),
            content_list_json=str(complete_path / make_filename(file_name, "content_list", "json")),
            middle_json=str(complete_path / make_filename(file_name, "middle", "json")),
            markdown=str(complete_path / make_filename(file_name, None, "md")),
            layout_pdf=str(complete_path / make_filename(file_name, "layout", "pdf")),
            model_pdf=str(complete_path / make_filename(file_name, "model", "pdf")),
            origin_pdf=str(complete_path / make_filename(file_name, "origin", "pdf")),
            span_pdf=str(complete_path / make_filename(file_name, "span", "pdf")),
        )

    def _replace_image_with_base64(self, markdown_text: str, image_dir_path: str) -> str:
        """Markdown의 이미지 링크를 base64로 변환"""
        # Markdown의 이미지 태그 매칭
        pattern = r"\!\[(?:[^\]]*)\]\(([^)]+)\)"

        def image_to_base64(image_path: str) -> str:
            """이미지를 base64로 변환"""
            try:
                with open(image_path, "rb") as image_file:
                    return base64.b64encode(image_file.read()).decode("utf-8")
            except Exception as e:
                logger.warning(f"Failed to convert image to base64: {image_path}, error: {e}")
                return ""

        # 이미지 링크 교체
        def replace(match):
            relative_path = match.group(1)
            full_path = os.path.join(image_dir_path, relative_path)
            if os.path.exists(full_path):
                base64_image = image_to_base64(full_path)
                if base64_image:
                    # 이미지 확장자 확인
                    ext = Path(relative_path).suffix.lower()
                    mime_type = {
                        ".jpg": "jpeg",
                        ".jpeg": "jpeg",
                        ".png": "png",
                        ".gif": "gif",
                        ".webp": "webp",
                    }.get(ext, "jpeg")
                    return f"![{relative_path}](data:image/{mime_type};base64,{base64_image})"
            return match.group(0)  # 파일이 없으면 원본 반환

        # 교체 적용
        return re.sub(pattern, replace, markdown_text)

    def _extract_content_list(self, markdown_content: str, file_name: str) -> list[dict]:
        """Extract content list from markdown for compatibility"""
        try:
            # 간단한 content list 생성 - 실제 구현에서는 더 정교한 파싱 필요
            content_list = []

            # 헤더들을 찾아서 content list 생성
            lines = markdown_content.split("\n")
            for i, line in enumerate(lines):
                line = line.strip()
                if line.startswith("#"):
                    # 헤더 레벨 계산
                    level = len(line) - len(line.lstrip("#"))
                    title = line.lstrip("#").strip()

                    if title:  # 빈 제목이 아닌 경우만
                        content_list.append(
                            {
                                "type": "title",
                                "level": level,
                                "content": title,
                                "page_num": 0,  # 실제 구현에서는 페이지 번호 추출 필요
                                "bbox": [0, 0, 0, 0],  # 실제 구현에서는 실제 bbox 필요
                            }
                        )

                # 이미지 찾기
                elif "![" in line and "](" in line:
                    # 이미지 정보 추출
                    import re

                    img_pattern = r"!\[([^\]]*)\]\(([^)]+)\)"
                    matches = re.findall(img_pattern, line)
                    for alt_text, img_src in matches:
                        content_list.append(
                            {
                                "type": "image",
                                "content": alt_text or "image",
                                "img_path": img_src,
                                "page_num": 0,
                                "bbox": [0, 0, 0, 0],
                            }
                        )

            # 최소한 하나의 항목은 있어야 함
            if not content_list:
                content_list.append(
                    {
                        "type": "document",
                        "content": f"Processed document: {file_name}",
                        "page_num": 0,
                        "bbox": [0, 0, 0, 0],
                    }
                )

            return content_list

        except Exception as e:
            logger.warning(f"Failed to extract content list: {e}")
            return [
                {
                    "type": "document",
                    "content": f"Processed document: {file_name}",
                    "page_num": 0,
                    "bbox": [0, 0, 0, 0],
                }
            ]
