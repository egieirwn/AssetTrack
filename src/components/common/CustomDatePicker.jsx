import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function formatDateDisplay(isoString) {
  if (!isoString) return '';
  const parts = isoString.split('-');
  if (parts.length !== 3) return isoString;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoString;
  return `${day} ${MONTH_NAMES[month]?.slice(0, 3)} ${year}`;
}

/**
 * CustomDatePicker - An Atrium-styled modern calendar date picker.
 * Replaces native Chromium OS date input popup with a sleek Atrium popover calendar.
 */
export default function CustomDatePicker({
  value = '',
  onChange,
  placeholder = 'Pilih tanggal...',
  className = '',
  style = {},
  disabled = false,
  min,
  max,
  clearable = true,
  title,
  id,
  name
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Parse initial view year and month
  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(!isNaN(initialDate.getTime()) ? initialDate.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(!isNaN(initialDate.getTime()) ? initialDate.getMonth() : new Date().getMonth());

  // Update view when value changes from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Close on click outside
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

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectDate = (year, month, day) => {
    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const isoString = `${year}-${formattedMonth}-${formattedDay}`;

    if (onChange) {
      onChange({
        target: {
          name: name || '',
          value: isoString
        }
      });
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange({
        target: {
          name: name || '',
          value: ''
        }
      });
    }
    setIsOpen(false);
  };

  const handleToday = (e) => {
    e.stopPropagation();
    const today = new Date();
    const formattedMonth = String(today.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(today.getDate()).padStart(2, '0');
    const isoString = `${today.getFullYear()}-${formattedMonth}-${formattedDay}`;
    if (onChange) {
      onChange({
        target: {
          name: name || '',
          value: isoString
        }
      });
    }
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  // Generate calendar days
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const days = [];
  // Trailing days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: daysInPrevMonth - i,
      month: viewMonth === 0 ? 11 : viewMonth - 1,
      year: viewMonth === 0 ? viewYear - 1 : viewYear,
      isCurrentMonth: false
    });
  }
  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      day: d,
      month: viewMonth,
      year: viewYear,
      isCurrentMonth: true
    });
  }
  // Remaining days to fill grid (multiple of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      day: d,
      month: viewMonth === 11 ? 0 : viewMonth + 1,
      year: viewMonth === 11 ? viewYear + 1 : viewYear,
      isCurrentMonth: false
    });
  }

  const todayObj = new Date();
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style
      }}
      title={title}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={className || 'atrium-input'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '0.45rem 0.75rem',
          height: '38px',
          borderRadius: '9999px',
          fontSize: '0.8125rem',
          minWidth: '135px',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
          <Calendar size={14} color="#64748b" style={{ flexShrink: 0 }} />
          <span style={{ color: value ? '#0F172A' : '#94A3B8', fontWeight: value ? 500 : 400, whiteSpace: 'nowrap' }}>
            {value ? formatDateDisplay(value) : placeholder}
          </span>
        </div>
        {clearable && value && !disabled && (
          <span
            onClick={handleClear}
            style={{
              display: 'inline-flex',
              padding: '2px',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#94a3b8'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Popover Calendar */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1050,
            width: '280px',
            background: '#FFFFFF',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '16px',
            boxShadow: '0 14px 35px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            padding: '1rem',
            userSelect: 'none',
            boxSizing: 'border-box'
          }}
        >
          {/* Header Month / Year & Prev / Next */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '0.5rem' }}>
            {DAY_NAMES.map(name => (
              <span key={name} style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#94A3B8' }}>
                {name}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {days.map((item, idx) => {
              const formattedM = String(item.month + 1).padStart(2, '0');
              const formattedD = String(item.day).padStart(2, '0');
              const dateStr = `${item.year}-${formattedM}-${formattedD}`;
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;

              const isPastMin = min && dateStr < min;
              const isPostMax = max && dateStr > max;
              const isDisabled = isPastMin || isPostMax;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && handleSelectDate(item.year, item.month, item.day)}
                  style={{
                    background: isSelected ? '#0F172A' : 'transparent',
                    color: isSelected
                      ? '#FFFFFF'
                      : !item.isCurrentMonth
                      ? '#CBD5E1'
                      : isDisabled
                      ? '#CBD5E1'
                      : '#1E293B',
                    border: isToday && !isSelected ? '1px solid #0F172A' : 'none',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    margin: '0 auto',
                    fontSize: '0.78125rem',
                    fontWeight: isSelected || isToday ? 700 : 400,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.backgroundColor = '#F1F5F9';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem', paddingTop: '0.625rem', borderTop: '1px solid #F1F5F9' }}>
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '0.75rem',
                color: '#64748B',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Hapus
            </button>
            <button
              type="button"
              onClick={handleToday}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0F172A',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Hari Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

