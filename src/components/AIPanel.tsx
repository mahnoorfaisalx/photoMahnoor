import { getItem, setItem } from '../lib/storage';
import { useState } from 'react';
import { editor } from '../editor/editor';
import { useStore } from '../store';
import { Section, Seg } from './ui';
import { removeBackgroundFromLayer, selectSubject } from '../editor/ai';
import { Eraser, ImageOff, Wand2, Replace, Scissors } from 'lucide-react';

export function AIPanel() {
  const hasPx = useStore((s) => s.hasPixelSelection);
  const setTool = useStore((s) => s.setTool);
  const d = useStore((s) => s.setDialog);
  const [model, setModel] = useState(getItem('pm.aiModel') || 'isnet_fp16');
  return (
    <div className="panel-scroll" data-testid="ai-panel">
      <Section title="Background">
        <button className="btn primary block" data-testid="ai-remove-bg" onClick={() => removeBackgroundFromLayer('ai')}>
          <ImageOff size={15} /> Remove background (AI)
        </button>
        <button className="btn block" data-testid="quick-remove-bg" onClick={() => removeBackgroundFromLayer('quick')}>
          <Scissors size={15} /> Quick remove (solid backgrounds, offline)
        </button>
        <button className="btn block" onClick={() => d('bgReplace')}>
          <Replace size={15} /> Replace background…
        </button>
        <p className="muted small">The original image is kept as a hidden layer, so it's fully reversible.</p>
      </Section>
      <Section title="Smart selection">
        <button className="btn block" onClick={() => selectSubject('ai')}>
          <Wand2 size={15} /> Select subject
        </button>
        <button className="btn block" onClick={() => setTool('wand')}>Magic wand (click similar colours)</button>
        <p className="muted small">Then extract, fill, blur, or remove the selection from the Design tab.</p>
      </Section>
      <Section title="Object removal">
        <ol className="steps">
          <li>
            <button className="link" onClick={() => setTool('brushSelect')}>Pick the brush select tool</button> (S) and paint over the object.
          </li>
          <li>Click <b>Remove object</b>.</li>
        </ol>
        <button className="btn primary block" disabled={!hasPx} data-testid="ai-remove-object" onClick={() => editor.removeObject()}>
          <Eraser size={15} /> Remove object
        </button>
        <p className="muted small">Content-aware fill, generated as a separate patch layer you can hide or delete.</p>
      </Section>
      <Section title="Model" defaultOpen={false}>
        <Seg
          value={model}
          onChange={(v) => {
            setModel(v);
            setItem('pm.aiModel', v);
          }}
          options={[
            { value: 'isnet_quint8', label: 'Fast', title: '~40MB, quickest' },
            { value: 'isnet_fp16', label: 'Balanced', title: '~80MB' },
            { value: 'isnet', label: 'Best', title: '~170MB, best edges' },
          ]}
        />
        <p className="muted small">
          AI runs privately in your browser (ONNX/WebAssembly). The model downloads once on first use and is cached. If it can't load (offline / blocked), the app falls back to quick colour-based removal automatically.
        </p>
      </Section>
    </div>
  );
}
