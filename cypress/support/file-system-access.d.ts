export {};

// Augment the global Window interface with the experimental File System Access API
// so tests can stub it safely even if the current lib.dom typings do not include it.
declare global {
  interface Window {
    showSaveFilePicker?: (
      options?: any,
    ) => Promise<{
      createWritable: () => Promise<{
        write: (...args: any[]) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }
}
