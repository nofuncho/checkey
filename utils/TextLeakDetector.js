// utils/TextLeakDetector.js
import React from 'react';

function walk(node, path, report) {
  if (typeof node === 'string') {
    // 맨몸 텍스트 발견!
    report(path, node);
    return;
  }
  if (!node || !node.props) return;

  const children = node.props.children;
  if (Array.isArray(children)) {
    children.forEach((c, i) => walk(c, `${path}/${node.type?.name || node.type}`, report));
  } else {
    walk(children, `${path}/${node.type?.name || node.type}`, report);
  }
}

export default function TextLeakDetector({ name = 'Root', children }) {
  React.useEffect(() => {
    React.Children.forEach(children, (child) =>
      walk(child, name, (where, text) => {
        // 길면 앞부분만
        const sample = (text || '').replace(/\s+/g, ' ').slice(0, 80);
        console.warn(
          `[TextLeakDetector] 맨몸 텍스트 발견 @ ${where}\n→ "${sample}"\n(해당 위치의 JSX를 <Text>로 감싸주세요)`
        );
      })
    );
  }, [children, name]);

  return <>{children}</>;
}
