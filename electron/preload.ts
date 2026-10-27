import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  AdminStatus,
  AppSettings,
  JobProgressEvent,
  ManagedSite,
  RenewResult,
  UpdateStatus,
} from './shared/types';

const api = {
  getAdminStatus: (): Promise<AdminStatus> => ipcRenderer.invoke('admin:getStatus'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  listSites: (): Promise<ManagedSite[]> => ipcRenderer.invoke('sites:list'),
  requestOrRenew: (siteId: string): Promise<RenewResult> =>
    ipcRenderer.invoke('certs:requestOrRenew', siteId),
  renewAll: (): Promise<RenewResult[]> => ipcRenderer.invoke('certs:renewAll'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:getStatus'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  onJobProgress: (callback: (event: JobProgressEvent) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, data: JobProgressEvent) => callback(data);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, data: UpdateStatus) => callback(data);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
};

contextBridge.exposeInMainWorld('iisCert', api);

export type IisCertApi = typeof api;
