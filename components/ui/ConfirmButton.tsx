'use client';
import { useEffect, useState } from 'react';

/** A button that asks once before it spends or sells: the first tap turns it into "Sure? …", the second does it.
 * It goes back to normal after a few seconds. With `confirm` false it acts on the first tap. */
export function ConfirmButton({
  confirm = true,
  ask,
  onClick,
  disabled,
  className = '',
  children,
}: {
  confirm?: boolean;
  ask: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`${className} ${armed ? '!bg-amber-500 !text-black' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        onClick();
      }}
    >
      {armed ? ask : children}
    </button>
  );
}
