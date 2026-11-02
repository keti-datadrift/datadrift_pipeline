import pytest

from backend.models.evaluation import generate_batches


def test_batches_keep_order_counts_and_partial_last_batch():
    rows = list(range(19))
    batches = list(
        generate_batches(
            rows,
            8,
            lambda part: [f"answer-{i}" for i in part],
            MemoryError,
            lambda: None,
        )
    )
    assert [len(part) for part, _, _ in batches] == [8, 8, 3]
    assert [r for part, _, _ in batches for r in part] == rows
    assert [answer for _, answers, _ in batches for answer in answers] == [
        f"answer-{i}" for i in rows
    ]


def test_oom_retries_same_unfinished_rows_and_retains_completed_results():
    calls, clears = [], []

    def generate(part):
        calls.append(part)
        if part[0] >= 8 and len(part) > 2:
            raise MemoryError()
        return part.copy()

    batches = list(
        generate_batches(
            list(range(19)), 8, generate, MemoryError, lambda: clears.append(True)
        )
    )
    assert [item for _, responses, _ in batches for item in responses] == list(
        range(19)
    )
    assert calls[:4] == [list(range(8)), list(range(8, 16)), list(range(8, 12)), [8, 9]]
    assert len(clears) == 2


def test_single_item_oom_and_incomplete_output_are_not_hidden():
    def fail(part):
        raise MemoryError()

    with pytest.raises(MemoryError):
        list(generate_batches([1], 1, fail, MemoryError, lambda: None))
    with pytest.raises(ValueError, match="응답 수"):
        list(generate_batches([1, 2], 8, lambda part: [], MemoryError, lambda: None))
