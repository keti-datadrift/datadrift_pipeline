import json
import re
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4 as uuid

from drf_yasg import openapi

# Label Studio uses drf-yasg for API documentation
from drf_yasg.utils import swagger_auto_schema
from mineru.utils.enum_class import ModelInvokeConfig as MineruModelInvokeConfig
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

try:
    from loguru import logger
except ImportError:
    import logging

    logger = logging.getLogger(__name__)


# Use local shared service
try:
    from .service.parse_service import ParseService
except ImportError:
    logger.warning("service.parse_service module not found, using mock ParseService")
    ParseService = None

from .docs import (
    LAYOUT_DESCRIPTION_DETAIL,
    OCR_DESCRIPTION_DETAIL,
    PARSE_DOCUMENT_DESCRIPTION_DETAIL,
    TABLE_DESCRIPTION_DETAIL,
)
from .file_handler import compress_markdown_images
from .serializers import (
    ErrorResponse,
    ImageOCRResponse,
    LayoutResponse,
    ParseDocumentRequest,
    ParseDocumentResponse,
)

SUPPORTED_MIME_TYPES = {
    # PDF
    "application/pdf",
    # Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/webp",
    # MS Office - Modern formats (Office 2007+)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    # MS Office - Legacy formats (Office 97-2003)
    "application/msword",  # .doc
    "application/vnd.ms-word",  # .doc (alternative)
    "application/vnd.ms-excel",  # .xls
    "application/vnd.ms-powerpoint",  # .ppt
}


def convert_to_mineru_config(config):
    """Convert local ModelInvokeConfig to mineru ModelInvokeConfig format"""
    return MineruModelInvokeConfig.model_validate(
        {
            "model_type": config["type"],
            "model_subtype": config.get("sub_type"),
            "model_name": config["name"],
            "model_version": config["version"],
        }
    )


class ParseDocumentView(APIView):
    """문서 OCR 및 마크다운 변환"""

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    @swagger_auto_schema(
        tags=["QOCR ML"],
        operation_summary="문서 OCR 및 마크다운 변환",
        operation_description=PARSE_DOCUMENT_DESCRIPTION_DETAIL,
        manual_parameters=[
            openapi.Parameter(
                name="file",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="PDF, 이미지 또는 오피스 문서",
                required=True,
            ),
            openapi.Parameter(
                name="invoke_config",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_STRING,
                description="JSON 형태의 모델 설정",
                default=json.dumps(
                    {
                        "layout": {"type": "layout", "name": "RTDETR", "version": "1.0.0"},
                        "ocr_cls": {"type": "ocr", "sub_type": "cls", "name": "unused_model", "version": "0.1.0"},
                        "ocr_det": {
                            "type": "ocr",
                            "sub_type": "det",
                            "name": "PP-OCRv4_det_server_finetune_v2(ko)",
                            "version": "2.0.0",
                        },
                        "ocr_rec": {
                            "type": "ocr",
                            "sub_type": "rec",
                            "name": "PP-OCRv4_rec_doc_finetune_v3(ko)",
                            "version": "3.0.0",
                        },
                    }
                ),
            ),
            openapi.Parameter(
                name="apply_fig",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_BOOLEAN,
                description="그림 적용 여부",
                default=True,
            ),
            openapi.Parameter(
                name="apply_table",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_BOOLEAN,
                description="테이블 적용 여부",
                default=True,
            ),
        ],
        responses={
            200: ParseDocumentResponse,
            400: ErrorResponse,
        },
    )
    def post(self, request, *args, **kwargs):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"status_code": 400, "message": "파일이 제공되지 않았습니다."}, status=status.HTTP_400_BAD_REQUEST
            )

        if file.content_type not in SUPPORTED_MIME_TYPES:
            return Response(
                {
                    "status_code": 400,
                    "message": "지원되지 않는 파일 형식입니다. PDF, 이미지, 오피스 문서(.pdf, .jpg, .jpeg, .png, .ppt, .pptx, .doc, .docx, .xls, .xlsx)를 업로드해주세요.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        filename = file.name
        if not filename:
            filename = f"{uuid().hex}{Path(file.name).suffix if file.name else ''}"

        # Replace all empty spaces from the filename to underscore
        filename = re.sub(r"\s", "_", filename)
        logger.debug(f"Uploaded file: {filename}")

        file_bytes = file.read()
        suffix = Path(filename).suffix

        # Get invoke_config from request
        invoke_config_str = request.data.get(
            "invoke_config",
            json.dumps(
                {
                    "layout": {"type": "layout", "name": "RTDETR", "version": "1.0.0"},
                    "ocr_cls": {"type": "ocr", "sub_type": "cls", "name": "unused_model", "version": "0.1.0"},
                    "ocr_det": {
                        "type": "ocr",
                        "sub_type": "det",
                        "name": "PP-OCRv4_det_server_finetune_v2(ko)",
                        "version": "2.0.0",
                    },
                    "ocr_rec": {
                        "type": "ocr",
                        "sub_type": "rec",
                        "name": "PP-OCRv4_rec_doc_finetune_v3(ko)",
                        "version": "3.0.0",
                    },
                }
            ),
        )

        apply_fig = request.data.get("apply_fig", "true").lower() == "true"
        apply_table = request.data.get("apply_table", "true").lower() == "true"

        # Parse JSON string to dict
        try:
            invoke_config_dict = json.loads(invoke_config_str)
            # Validate with serializer
            serializer = ParseDocumentRequest(data=invoke_config_dict)
            if not serializer.is_valid():
                return Response(
                    {"status_code": 400, "message": f"잘못된 설정 형식입니다: {serializer.errors}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invoke_config_validated = serializer.validated_data
        except (json.JSONDecodeError, ValueError) as e:
            return Response(
                {"status_code": 400, "message": f"잘못된 JSON 형식입니다: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if ParseService is available
        if not ParseService:
            # Return mock response if service is not available
            mock_markdown = (
                f"# Mock OCR Result\n\nThis is a mock result for file: {filename}\n\nParseService is not available."
            )
            mock_file_data = compress_markdown_images(
                file_name=filename,
                markdown=mock_markdown,
                content_list=[],
                images_base_path=None,
            )

            response_serializer = ParseDocumentResponse(
                data={
                    "markdown": mock_markdown,
                    "file_data": mock_file_data,
                    "model_info": {"name": "Q-OCR-Mock", "version": "2025-04-21"},
                }
            )
            response_serializer.is_valid(raise_exception=True)
            return Response(response_serializer.data)

        # Create new temp file for each request
        with NamedTemporaryFile(suffix=suffix, mode="wb+", delete=False) as temp_file:
            temp_file.write(file_bytes)
            temp_file.seek(0)  # Reset file pointer

            # Initialize ParseService
            parse_service = ParseService()

            # Parse document using the new temp file
            # Ensure invoke_config_validated is a dict for type safety
            config = invoke_config_validated if isinstance(invoke_config_validated, dict) else {}
            output = parse_service.process_document(
                pdf_path=temp_file.name,
                max_pages=0,
                invoke_config={
                    "layout": convert_to_mineru_config(config.get("layout", {})),
                    "ocrcls": convert_to_mineru_config(config.get("ocr_cls", {})),
                    "ocrdet": convert_to_mineru_config(config.get("ocr_det", {})),
                    "ocrrec": convert_to_mineru_config(config.get("ocr_rec", {})),
                },
            )

        # Zip archive with markdown & images
        encoded_compressed_file = compress_markdown_images(
            file_name=filename,
            markdown=output.markdown,
            content_list=output.content_list,
            images_base_path=output.images_path,
        )

        response_serializer = ParseDocumentResponse(
            data={
                "markdown": output.markdown,
                "file_data": encoded_compressed_file,
                "model_info": {"name": "Q-OCR", "version": "2025-04-21"},
            }
        )
        response_serializer.is_valid(raise_exception=True)
        return Response(response_serializer.data)


class LayoutView(APIView):
    """이미지 레이아웃 정보 추출"""

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    @swagger_auto_schema(
        tags=["QOCR ML"],
        operation_summary="이미지 레이아웃 정보 추출",
        operation_description=LAYOUT_DESCRIPTION_DETAIL,
        deprecated=True,
        manual_parameters=[
            openapi.Parameter(
                name="files",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="이미지 파일 리스트",
                required=True,
            ),
        ],
        responses={
            200: LayoutResponse(many=True),
            400: ErrorResponse,
            501: openapi.Response(description="Not Implemented"),
        },
    )
    def post(self, request, *args, **kwargs):
        # This endpoint is deprecated and not implemented
        # Keeping the commented implementation for reference

        # files = request.FILES.getlist('files')
        # if not files:
        #     return Response(
        #         {"status_code": 400, "message": "파일이 주어지지 않았습니다. 파일을 추가하고 다시 시도해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # if files[0].content_type not in ["image/jpeg", "image/png"]:
        #     return Response(
        #         {"status_code": 400, "message": "지원되지 않는 파일 형식입니다. 이미지 파일(.jpg, .jpeg, .png)을 업로드해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # file_bytes = [f.read() for f in files]

        # # Initialize LayoutService if available
        # from shared.service import LayoutService
        # layout_service = LayoutService()
        #
        # layout_results = layout_service.layout(images=file_bytes)
        #
        # response_data = []
        # for f, layout_result_group in zip(files, layout_results):
        #     response_data.append({
        #         "file_name": f.name or "Unknown Filename",
        #         "results": [
        #             layout_result_item.model_dump()
        #             for layout_result_item in layout_result_group.root or []
        #         ],
        #     })
        #
        # return Response(response_data)

        return Response(
            {"detail": "This endpoint is deprecated and not implemented"}, status=status.HTTP_501_NOT_IMPLEMENTED
        )


class OCRView(APIView):
    """이미지 OCR 텍스트 추출"""

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    @swagger_auto_schema(
        tags=["QOCR ML"],
        operation_summary="이미지 OCR 텍스트 추출",
        operation_description=OCR_DESCRIPTION_DETAIL,
        deprecated=True,
        manual_parameters=[
            openapi.Parameter(
                name="files",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="이미지 파일 리스트",
                required=True,
            ),
        ],
        responses={
            200: ImageOCRResponse(many=True),
            400: ErrorResponse,
            501: openapi.Response(description="Not Implemented"),
        },
    )
    def post(self, request, *args, **kwargs):
        # This endpoint is deprecated and not implemented
        # Keeping the commented implementation for reference

        # files = request.FILES.getlist('files')
        # if not files:
        #     return Response(
        #         {"status_code": 400, "message": "파일이 주어지지 않았습니다. 파일을 추가하고 다시 시도해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # if files[0].content_type not in ["image/jpeg", "image/png"]:
        #     return Response(
        #         {"status_code": 400, "message": "지원되지 않는 파일 형식입니다. 이미지 파일(.jpg, .jpeg, .png)을 업로드해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # file_bytes = [f.read() for f in files]

        # # Initialize OCRService if available
        # from shared.service import OCRService
        # ocr_service = OCRService()
        #
        # ocr_results = ocr_service.ocr(
        #     images=file_bytes,
        #     ocr_det_model=OCR_DET_MODEL_NAMES.PPOCRv4_SERVER_FTv2,
        #     ocr_rec_model=OCR_REC_MODEL_NAMES.PPOCRv4_SERVER_FTv3,
        # )
        #
        # response_data = []
        # for f, ocr_result_group in zip(files, ocr_results):
        #     response_data.append({
        #         "file_name": f.name or "Unknown Filename",
        #         "results": [
        #             ocr_result_item.text for ocr_result_item in ocr_result_group.root or []
        #         ],
        #     })
        #
        # return Response(response_data)

        return Response(
            {"detail": "This endpoint is deprecated and not implemented"}, status=status.HTTP_501_NOT_IMPLEMENTED
        )


class TableView(APIView):
    """이미지 테이블 구조 및 텍스트 추출"""

    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    @swagger_auto_schema(
        tags=["QOCR ML"],
        operation_summary="이미지 테이블 구조 및 텍스트 추출",
        operation_description=TABLE_DESCRIPTION_DETAIL,
        deprecated=True,
        manual_parameters=[
            openapi.Parameter(
                name="files",
                in_=openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="이미지 파일 리스트",
                required=True,
            ),
        ],
        responses={
            200: openapi.Response(
                description="Table extraction results",
                schema=openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_STRING)),
            ),
            400: ErrorResponse,
            501: openapi.Response(description="Not Implemented"),
        },
    )
    def post(self, request, *args, **kwargs):
        # This endpoint is deprecated and not implemented
        # Keeping the commented implementation for reference

        # files = request.FILES.getlist('files')
        # if not files:
        #     return Response(
        #         {"status_code": 400, "message": "파일이 주어지지 않았습니다. 파일을 추가하고 다시 시도해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # if files[0].content_type not in ["image/jpeg", "image/png"]:
        #     return Response(
        #         {"status_code": 400, "message": "지원되지 않는 파일 형식입니다. 이미지 파일(.jpg, .jpeg, .png)을 업로드해주세요."},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        # file_bytes = [f.read() for f in files]

        # # Initialize TableService and OCRService if available
        # from shared.service import TableService, OCRService
        # table_service = TableService()
        # ocr_service = OCRService()
        #
        # outputs = []
        # for file_bytes in file_bytes:
        #     result = table_service.table(
        #         image_bytes=file_bytes,
        #         ocr_engine=ocr_service.get_model(),
        #         sub_model_name=TABLE_SUBMODULE_NAMES.SLANET_PLUS_250512,
        #     )
        #     outputs.append(result)
        #
        # return Response(outputs)

        return Response(
            {"detail": "This endpoint is deprecated and not implemented"}, status=status.HTTP_501_NOT_IMPLEMENTED
        )
