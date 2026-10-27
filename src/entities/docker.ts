export enum Containers {
  MLBACKEND = 'ml-backend',
  DASHBOARD = 'dashboard',
  NGINX = 'nginx',
  LABELSTUDIO = 'label-studio',
  DB = 'db',
  WATCHER = 'watcher',
  DEMO = 'demo',
}

export namespace Containers {
  export function allCases(): string[] {
    return [
      Containers.MLBACKEND,
      Containers.DASHBOARD,
      Containers.NGINX,
      Containers.LABELSTUDIO,
      Containers.DB,
      Containers.WATCHER,
      Containers.DEMO,
    ];
  }
}
