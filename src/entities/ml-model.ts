export enum ModelType {
  LAYOUT = 'layout',
  OCRCLS = 'ocrcls',
  OCRREC = 'ocrrec',
  OCRDET = 'ocrdet',
  TABREC = 'tabrec',
}

export namespace ModelType {
  export function presentationName(type: ModelType): string {
    switch (type) {
      case ModelType.LAYOUT:
        return 'Layout Detection';
      case ModelType.OCRCLS:
        return 'OCR Classification';
      case ModelType.OCRREC:
        return 'OCR Recognition';
      case ModelType.OCRDET:
        return 'OCR Detection';
      case ModelType.TABREC:
        return 'Table Recognition';
    }
  }

  export function fromString(type: string): ModelType {
    switch (type) {
      case 'layout':
        return ModelType.LAYOUT;
      case 'ocrcls':
        return ModelType.OCRCLS;
      case 'ocrrec':
        return ModelType.OCRREC;
      case 'ocrdet':
        return ModelType.OCRDET;
      case 'tabrec':
        return ModelType.TABREC;
      default:
        throw new TypeError(`Invalid model type: ${type}`);
    }
  }

  export function allCases(): ModelType[] {
    return [
      ModelType.LAYOUT,
      ModelType.OCRCLS,
      ModelType.OCRREC,
      ModelType.OCRDET,
      ModelType.TABREC,
    ];
  }
}

export type Model = {
  id: string;
  name: string;
  type: 'layout' | 'ocrcls' | 'ocrrec' | 'ocrdet' | 'tabrec';
  version: string;
  updatedAt: string;
  description?: string;
};

export type ModelVersion = {
  id: string;
  version: string;
  trainedAt: string;
};
