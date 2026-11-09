// Used only by the single-file preview build: the AI model is not bundled there,
// so background removal falls back to the quick offline engine.
export async function removeBackground(): Promise<Blob> {
  throw new Error('AI model not included in this build');
}
