import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Mentionable } from '../types/employee360';
import {
  activeTrigger,
  insertToken,
  suggestions,
  type ActiveTrigger,
  type MentionToken,
} from '../services/mentions';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Allowed people and departments (from the backend); null = no suggestions. */
  mentionable: Mentionable | null;
  /** Called when the user picks a suggestion, so the caller can send its ID. */
  onToken: (token: MentionToken) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
  rows?: number;
  className?: string;
}

/**
 * Question box with "@" (people, @all) and "#" (departments) suggestions.
 * A textarea with an attached listbox: ↑ ↓ to move, Enter or Tab to pick,
 * Esc to close; Enter without a list open sends the question.
 */
export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  mentionable,
  onToken,
  onSubmit,
  disabled,
  placeholder,
  rows = 1,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const [active, setActive] = useState<ActiveTrigger | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const options = active ? suggestions(mentionable, active.trigger, active.query) : [];
  const open = Boolean(active) && options.length > 0 && dismissedAt !== active?.start;
  const index = Math.min(highlight, Math.max(options.length - 1, 0));

  const refresh = (text: string, caret: number) => {
    const next = activeTrigger(text, caret);
    setActive(next);
    if (!next || next.start !== active?.start) {
      setHighlight(0);
      setDismissedAt(null);
    }
  };

  const pick = (token: MentionToken) => {
    const el = textareaRef.current;
    if (!active || !el) return;
    const caret = el.selectionStart ?? value.length;
    const result = insertToken(value, caret, active, token);
    onChange(result.text);
    onToken(token);
    setActive(null);
    setHighlight(0);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(result.caret, result.caret);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((index + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((index - 1 + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(options[index]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedAt(active?.start ?? null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  // Grows with the text up to the CSS max-height, then scrolls inside (no wasted space when short).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    // 1px tolerance: fractional line heights must not show a scrollbar at exactly the max
    el.style.overflowY = el.scrollHeight > max + 1 ? 'auto' : 'hidden';
  }, [value]);

  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <div className="mention-input">
      <textarea
        ref={textareaRef}
        className={className}
        rows={rows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(index) : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          refresh(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            refresh(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
          }
        }}
        onClick={(event) => refresh(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
        onBlur={() => setActive(null)}
      />
      {open && (
        <ul id={listId} className="mention-popup" role="listbox" aria-label="Suggestions">
          {options.map((option, i) => (
            <li
              key={option.kind === 'employee' ? option.id : `${option.kind}:${option.label}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === index}
              className={`mention-option ${i === index ? 'is-active' : ''}`}
              onMouseDown={(event) => {
                // Keep focus in the textarea; pick on mouse down before blur closes the list
                event.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className={`mention-option-icon is-${option.kind}`} aria-hidden="true">
                {option.kind === 'department' ? '#' : '@'}
              </span>
              <span className="mention-option-text">
                <span className="mention-option-label">{option.label}</span>
                {option.kind !== 'department' && option.detail && (
                  <span className="mention-option-detail">{option.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
