"""Ordered evaluation batches with a retry that never skips or repeats results."""


def generate_batches(rows, size, generate, oom_error, clear_memory):
    if size < 1:
        raise ValueError("평가 배치 크기는 1 이상이어야 합니다.")
    offset = 0
    while offset < len(rows):
        batch = rows[offset : offset + size]
        retry = False
        try:
            responses = generate(batch)
        except oom_error:
            if size == 1:
                raise
            size = max(1, size // 2)
            retry = True
        if retry:
            # The exception and its tensor-holding traceback are gone here.
            clear_memory()
            continue
        if len(responses) != len(batch):
            raise ValueError("평가 응답 수가 입력 이미지 수와 다릅니다.")
        yield batch, responses, size
        offset += len(batch)
