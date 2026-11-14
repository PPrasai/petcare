import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Button } from './Button';
import { Icon } from './icons';

interface DropZoneProps {
  title: string;
  hint: string;
  buttonLabel: string;
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}

/** A dashed target for a dropped file, with a button that opens the file chooser (SPEC-003 P-9). */
export function DropZone({ title, hint, buttonLabel, accept, onFile, disabled }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drag = (on: boolean) => (event: DragEvent) => {
    event.preventDefault();
    setOver(on);
  };
  return (
    <div
      className={`drop ${over ? 'on' : ''}`}
      data-testid="drop-zone"
      onDragEnter={drag(true)}
      onDragOver={drag(true)}
      onDragLeave={drag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
    >
      <Icon name="camera" />
      <b>{title}</b>
      <span>{hint}</span>
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        <Icon name="plus" />
        {buttonLabel}
      </Button>
      <input
        ref={input}
        type="file"
        className="vh"
        accept={accept}
        aria-label={buttonLabel}
        tabIndex={-1}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
