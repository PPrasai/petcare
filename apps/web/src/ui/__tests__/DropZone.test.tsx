// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropZone } from '../DropZone';

afterEach(cleanup);

const props = {
  title: 'Drop a photo here',
  hint: 'Stays on this device',
  buttonLabel: 'Choose a file',
  accept: 'image/png',
};

describe('DropZone', () => {
  it('passes a chosen file on and offers the chooser under the button label', () => {
    const onFile = vi.fn();
    render(<DropZone {...props} onFile={onFile} />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose a file'), { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('marks itself while a file is dragged over and passes the dropped file on', () => {
    const onFile = vi.fn();
    render(<DropZone {...props} onFile={onFile} />);
    const zone = screen.getByTestId('drop-zone');
    fireEvent.dragEnter(zone);
    expect(zone.className).toContain('on');
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(zone.className).not.toContain(' on');
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('ignores a drop while disabled', () => {
    const onFile = vi.fn();
    render(<DropZone {...props} disabled onFile={onFile} />);
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [new File(['x'], 'c.png')] },
    });
    expect(onFile).not.toHaveBeenCalled();
  });
});
