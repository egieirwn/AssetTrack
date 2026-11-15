import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect - An Atrium-styled dropdown select component.
 * Replaces native OS <select> with a beautiful, accessible popover list.
 * 
 * Supports both:
 * 1. options prop: [{ value: '', label: 'Semua Kategori' }, ...]
 * 2. standard <option value="...">Label</option> children.
 */
export default function CustomSelect({
  value,
  onChange,
  options,
  children,
  placeholder = 'Pilih...',
  className = '',
  style = {},
  disabled = false,
  name,
  id,
  size = 'md',
  ariaLabel,
  autoWidth = false,
  dropdownWidth,
  ...rest
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Normalize options from options prop or children <option> elements
  const normalizedOptions = React.useMemo(() => {
    if (Array.isArray(options) && options.length > 0) {
      return options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: opt.value !== undefined ? String(opt.value) : '',
            label: opt.label !== undefined ? opt.label : String(opt.value),
            disabled: !!opt.disabled,
            icon: opt.icon
          };
        }
        return {
          value: String(opt),
          label: String(opt),
          disabled: false
        };
      });
    }

    if (children) {
      const parsed = [];
      React.Children.forEach(children, child => {
        if (React.isValidElement(child) && child.type === 'option') {
          parsed.push({
            value: child.props.value !== undefined ? String(child.props.value) : '',
            label: child.props.children || child.props.label || String(child.props.value || ''),
            disabled: !!child.props.disabled
          });
        }
      });
      return parsed;
    }

    return [];
  }, [options, children]);

  // Current selected option
  const currentValStr = value !== undefined && value !== null ? String(value) : '';
  const selectedOption = normalizedOptions.find(opt => opt.value === currentValStr);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (opt) => {
    if (opt.disabled) return;
    setIsOpen(false);

    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name || '',
          value: opt.value
        },
        stopPropagation: () => {},
        preventDefault: () => {}
      };
      onChange(syntheticEvent);
    }
  };

  const isSmall = size === 'sm';

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${disabled ? 'disabled' : ''}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: autoWidth ? 'auto' : '100%',
        ...style
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || (typeof selectedOption?.label === 'string' ? selectedOption.label : placeholder)}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={className || 'atrium-filter-select'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          width: '100%',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: isSmall ? '0.35rem 0.75rem' : '0.55rem 1rem',
          fontSize: isSmall ? '0.8125rem' : '0.84375rem',
          boxSizing: 'border-box'
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selectedOption ? '#0F172A' : '#64748B',
            fontWeight: 500,
            flex: 1
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={isSmall ? 14 : 16}
          color="#64748B"
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: dropdownWidth || '100%',
            maxWidth: '380px',
            maxHeight: '260px',
            overflowY: 'auto',
            background: '#FFFFFF',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '14px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            padding: '0.375rem',
            zIndex: 1050,
            boxSizing: 'border-box'
          }}
        >
          {normalizedOptions.map(opt => {
            const isSelected = opt.value === currentValStr;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.625rem',
                  padding: isSmall ? '0.375rem 0.625rem' : '0.5rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: isSmall ? '0.8125rem' : '0.84375rem',
                  color: opt.disabled ? '#94A3B8' : isSelected ? '#0F172A' : '#334155',
                  backgroundColor: isSelected ? '#F1F5F9' : 'transparent',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  userSelect: 'none'
                }}
                onMouseEnter={e => {
                  if (!opt.disabled && !isSelected) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={e => {
                  if (!opt.disabled && !isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{opt.icon}</span>}
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <Check size={14} color="#0F172A" style={{ flexShrink: 0, strokeWidth: 2.5 }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

