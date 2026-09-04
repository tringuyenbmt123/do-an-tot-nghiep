// src/components/common/LoadingSpinner.jsx
export default function LoadingSpinner({ size = 20, color = '#00d4ff', label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className="animate-spin rounded-full border-2 border-transparent"
        style={{
          width: size,
          height: size,
          borderTopColor: color,
          borderRightColor: `${color}44`,
        }}
      />
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size={36} label="Loading..." />
    </div>
  );
}
