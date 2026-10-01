// src/components/common/JsonViewer.jsx
// Syntax-highlighted JSON viewer with copy-to-clipboard
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

function colorizeJson(jsonStr) {
  // Simple regex-based syntax highlighting
  return jsonStr
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
      let cls = 'text-cyan-300'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-blue-300' : 'text-green-300'; // key or string
      } else if (/true|false/.test(match)) {
        cls = 'text-orange-300';
      } else if (/null/.test(match)) {
        cls = 'text-gray-500';
      }
      return `<span class="${cls}">${match}</span>`;
    });
}

export default function JsonViewer({ data, maxHeight = '280px' }) {
  const [copied, setCopied] = useState(false);

  let formatted = '';
  try {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    formatted = JSON.stringify(obj, null, 2);
  } catch {
    formatted = typeof data === 'string' ? data : JSON.stringify(data);
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        title="Copy JSON"
        className="absolute top-2 right-2 z-10 p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      </button>
      <pre
        className="json-block"
        style={{ maxHeight }}
        dangerouslySetInnerHTML={{ __html: colorizeJson(formatted) }}
      />
    </div>
  );
}
