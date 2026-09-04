// src/components/common/Modal.jsx
import { X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Base Modal component with backdrop blur and animations
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {string} title
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl' | 'full'
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeMap = {
    sm:   'max-w-md',
    md:   'max-w-lg',
    lg:   'max-w-2xl',
    xl:   'max-w-4xl',
    full: 'max-w-7xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8, 12, 18, 0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0" style={{ backdropFilter: 'blur(4px)' }} />

      {/* Modal panel */}
      <div
        className={`relative w-full ${sizeMap[size] || sizeMap.md} glass-panel rounded-xl shadow-2xl animate-fade-in`}
        style={{ border: '1px solid rgba(0, 212, 255, 0.15)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
