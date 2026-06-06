import { useEffect, useState, useRef, type ReactNode } from "react";

interface PageTransitionProps {
  activeKey: string;
  children: ReactNode;
}

export function PageTransition({ activeKey, children }: PageTransitionProps) {
  const [displayState, setDisplayState] = useState<{
    key: string;
    node: ReactNode;
    exitingKey: string | null;
    exitingNode: ReactNode | null;
  }>({
    key: activeKey,
    node: children,
    exitingKey: null,
    exitingNode: null,
  });

  const prevKeyRef = useRef(activeKey);

  useEffect(() => {
    if (activeKey !== prevKeyRef.current) {
      const prevKey = prevKeyRef.current;
      prevKeyRef.current = activeKey;

      setDisplayState((prev) => ({
        key: activeKey,
        node: children,
        exitingKey: prevKey,
        exitingNode: prev.node,
      }));

      const timer = setTimeout(() => {
        setDisplayState((prev) => {
          if (prev.key === activeKey) {
            return {
              ...prev,
              exitingKey: null,
              exitingNode: null,
            };
          }
          return prev;
        });
      }, 300); // Matches the CSS transition duration of 300ms

      return () => clearTimeout(timer);
    } else {
      // Just update children if the key remains the same (e.g., internal prop updates)
      setDisplayState((prev) => ({
        ...prev,
        node: children,
      }));
    }
  }, [activeKey, children]);

  const { key, node, exitingKey, exitingNode } = displayState;

  return (
    <div className="page-transition-container">
      {exitingNode && (
        <div key={exitingKey} className="page-transition-stage page-exit">
          {exitingNode}
        </div>
      )}
      <div key={key} className="page-transition-stage page-enter">
        {node}
      </div>
    </div>
  );
}
