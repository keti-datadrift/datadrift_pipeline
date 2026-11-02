"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type Option = { id: string; name: string; disabled?: boolean; note?: string };

export function ModelPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<number | null>(null);
  const listDrag = useRef<{
    pointerId: number;
    startY: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, height: 0, total: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const shown = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selected = options.find((option) => option.id === value);
  const thumbHeight = Math.min(
    scroll.height,
    Math.max(28, scroll.height ** 2 / (scroll.total || 1)),
  );
  const thumbTop =
    scroll.total > scroll.height
      ? (scroll.top / (scroll.total - scroll.height)) *
        (scroll.height - thumbHeight)
      : 0;
  function readScroll() {
    if (list.current)
      setScroll({
        top: list.current.scrollTop,
        height: list.current.clientHeight,
        total: list.current.scrollHeight,
      });
  }
  function dragTo(y: number, track: HTMLDivElement) {
    const rect = track.getBoundingClientRect();
    const fraction =
      (y - rect.top - (dragOffset.current || 0)) /
      Math.max(1, rect.height - thumbHeight);
    if (list.current)
      list.current.scrollTop =
        Math.max(0, Math.min(1, fraction)) * (scroll.total - scroll.height);
  }
  function startListDrag(event: ReactPointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    const element = event.currentTarget;
    // Touch keeps the browser's native scrolling and momentum.
    if (
      event.pointerType === "touch" ||
      !event.isPrimary ||
      event.button !== 0 ||
      element.scrollHeight <= element.clientHeight
    )
      return;
    listDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      top: element.scrollTop,
      moved: false,
    };
  }
  function moveListDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = listDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = drag.startY - event.clientY;
    if (!drag.moved) {
      if (Math.abs(delta) < 6) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollTop = drag.top + delta;
  }
  function endListDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = listDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved && event.type === "pointerup";
    listDrag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    readScroll();
    const observer = new ResizeObserver(readScroll);
    observer.observe(list.current);
    return () => observer.disconnect();
  }, [open, shown.length, position.maxHeight]);
  function show() {
    setQuery("");
    setIndex(
      options.findIndex((option) => option.id === value && !option.disabled),
    );
    setOpen(true);
  }
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(option: Option) {
    if (option.disabled) return;
    onChange(option.id);
    close();
  }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 420), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const downward = below >= 280 || below >= above;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(downward
          ? { top: rect.bottom + 8 }
          : { bottom: window.innerHeight - rect.top + 8 }),
        maxHeight: Math.max(80, Math.min(384, downward ? below : above)),
      });
    };
    place();
    search.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popup.current?.contains(target) &&
        !trigger.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (open && index >= 0)
      popup.current
        ?.querySelector(`[data-index="${index}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") close();
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const start = index < 0 && direction === -1 ? 0 : index;
      for (let step = 1; step <= shown.length; step++) {
        const next = (start + direction * step + shown.length) % shown.length;
        if (!shown[next].disabled) {
          setIndex(next);
          break;
        }
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[index] || shown.find((option) => !option.disabled);
      if (option) choose(option);
    }
  }
  return (
    <div className="field model-picker">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-haspopup="listbox"
        data-model-id={value}
        className="model-picker-trigger"
        title={selected?.name}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{selected?.name || "사용 가능한 모델을 선택하세요"}</span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="model-picker-popup"
            style={position}
            onKeyDown={key}
          >
            <div className="model-picker-search">
              <Search size={16} />
              <input
                ref={search}
                type="search"
                autoComplete="off"
                aria-label={`${label} 검색`}
                aria-controls={`${id}-options`}
                aria-activedescendant={
                  shown[index] ? `${id}-option-${index}` : undefined
                }
                value={query}
                placeholder="모델 이름 검색"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIndex(-1);
                }}
              />
            </div>
            <div className="model-picker-list">
              <div
                ref={list}
                onScroll={readScroll}
                onPointerDown={startListDrag}
                onPointerMove={moveListDrag}
                onPointerUp={endListDrag}
                onPointerCancel={endListDrag}
                onLostPointerCapture={endListDrag}
                onClickCapture={(event) => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                data-dragging={dragging || undefined}
                role="listbox"
                id={`${id}-options`}
                aria-label={`${label} 목록`}
                className="model-picker-options"
              >
                {shown.map((option, i) => (
                  <div
                    key={option.id}
                    role="option"
                    id={`${id}-option-${i}`}
                    data-index={i}
                    data-model-id={option.id}
                    aria-selected={option.id === value}
                    aria-disabled={option.disabled || undefined}
                    className={`model-picker-option ${index === i ? "is-active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <span>
                      {option.name}
                      {option.disabled ? " (파일 없음)" : ""}
                      {option.note && <small>{option.note}</small>}
                    </span>
                    {option.id === value && <Check size={16} />}
                  </div>
                ))}
              </div>
              {scroll.total > scroll.height && (
                <div
                  className="model-picker-scrollbar"
                  role="scrollbar"
                  aria-label={`${label} 목록 스크롤`}
                  aria-controls={`${id}-options`}
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={Math.max(0, scroll.total - scroll.height)}
                  aria-valuenow={Math.round(scroll.top)}
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    const track = event.currentTarget;
                    const thumb =
                      track.firstElementChild!.getBoundingClientRect();
                    dragOffset.current =
                      event.target === track.firstElementChild
                        ? event.clientY - thumb.top
                        : thumbHeight / 2;
                    track.setPointerCapture(event.pointerId);
                    dragTo(event.clientY, track);
                  }}
                  onPointerMove={(event) => {
                    if (dragOffset.current !== null)
                      dragTo(event.clientY, event.currentTarget);
                  }}
                  onPointerUp={(event) => {
                    dragOffset.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => {
                    dragOffset.current = null;
                  }}
                  onLostPointerCapture={() => {
                    dragOffset.current = null;
                  }}
                  onKeyDown={(event) => {
                    const shifts: Record<string, number> = {
                      ArrowDown: 40,
                      ArrowUp: -40,
                      PageDown: scroll.height,
                      PageUp: -scroll.height,
                      Home: -scroll.total,
                      End: scroll.total,
                    };
                    if (event.key in shifts) {
                      event.preventDefault();
                      event.stopPropagation();
                      if (list.current)
                        list.current.scrollTop += shifts[event.key];
                    }
                  }}
                >
                  <div
                    data-scroll-thumb
                    style={{ height: thumbHeight, top: thumbTop }}
                  />
                </div>
              )}
            </div>
            {!shown.length && (
              <p className="empty">검색 조건에 맞는 모델이 없습니다.</p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
