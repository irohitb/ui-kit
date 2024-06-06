import { Component, Host, Prop, h, State, Watch } from '@stencil/core';
import { States, Size, IconPack, defaultIconPack, DyteI18n } from '../../exports';
import { useLanguage } from '../../lib/lang';
import { MediaPermission, Meeting } from '../../types/dyte-client';
import { permissionPrompts } from '../../utils/troubleshooter';

interface Devices {
  Microphone?: MediaDeviceInfo;
  Camera?: MediaDeviceInfo;
  Speaker?: MediaDeviceInfo;
}

@Component({
  tag: 'dyte-debugger-permissions-ui',
  styleUrl: 'dyte-debugger-permissions-ui.css',
  shadow: true,
})
export class DyteDebuggerAudio {
  /** Meeting object */
  @Prop() meeting!: Meeting;

  /** States object */
  @Prop() states: States;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() issueKey: number = 0;

  @State() permission: MediaPermission;

  @State() devices: Devices = {};

  /** Media Type */
  @Prop() mediaType: 'audio' | 'video' | 'screenshare';

  connectedCallback() {
    this.permissionUpdate(this.meeting, this.mediaType);
  }

  disconnectedCallback() {
    const { self } = this.meeting;
    self?.removeListener('mediaPermissionUpdate', this.updatePermission);
  }

  @Watch('meeting')
  @Watch('mediaType')
  permissionUpdate(meeting: Meeting, mediaType: 'audio' | 'video' | 'screenshare') {
    if (!meeting || !mediaType) return;
    const { self, troubleshoot } = meeting;
    this.permission = troubleshoot[mediaType]?.mediaPermission ?? 'NOT_REQUESTED';
    this.getDevices();
    self?.addListener('mediaPermissionUpdate', this.updatePermission.bind(this));
    self?.addListener('deviceUpdate', this.deviceUpdateListener.bind(this));
  }

  private updatePermission({ kind, message }) {
    if (kind !== this.mediaType) return;
    this.permission = message;
  }

  // TODO: later change this to events and consume the functions in audio/video troubleshooter components
  private async allowPermission() {
    if (this.mediaType === 'audio') {
      const troubleshooter = this.meeting.troubleshoot?.audio;
      await troubleshooter?.startTrackAnalysis(true);
      troubleshooter.stopTrackAnalysis();
    }
    if (this.mediaType === 'video') {
      const troubleshooter = this.meeting.troubleshoot?.video;
      await troubleshooter.startPreview();
      troubleshooter.stopPreview();
    }
  }

  private deviceUpdateListener({ device, preview }) {
    if (preview) return;
    if (device.kind === 'audioinput') this.devices = { ...this.devices, Microphone: device };
    if (device.kind === 'audiooutput') this.devices = { ...this.devices, Speaker: device };
    if (device.kind === 'videoinput') this.devices = { ...this.devices, Camera: device };
  }

  private getDevices() {
    const currentDevices = this.meeting?.self?.getCurrentDevices();
    const Microphone = currentDevices?.audio;
    const Speaker = currentDevices?.speaker;
    const Camera = currentDevices?.video;
    if (Microphone) this.devices = { ...this.devices, Microphone };
    if (Speaker) this.devices = { ...this.devices, Speaker };
    if (Camera) this.devices = { ...this.devices, Camera };
  }

  render() {
    const permission = permissionPrompts[this.mediaType]?.[this.permission];
    // const devices = this.getDevices();
    const { browserName, osName, isMobile } = this.meeting.self.device;
    const steps = permission.steps({ browserName, osName, media: this.mediaType });
    const image = permission.image({ browserName, isMobile, osName });

    const devices =
      this.mediaType === 'audio'
        ? ['Microphone', 'Speaker']
        : this.mediaType === 'video'
        ? ['Camera']
        : [];
    return (
      <Host>
        <h3>Device Permissions</h3>
        <div class={`info ${this.permission}`}>
          <dyte-icon size="sm" icon={this.iconPack[permission.icon]}></dyte-icon>
          {permission.info}
        </div>
        <div class="text">{permission.text}</div>
        {this.permission === 'ACCEPTED' && devices.length > 0 && (
          <div class="device-indicator">
            {devices.map((device) => (
              <div class="device">
                <div class="label">Active {device}</div>
                <div class="seperator">:</div>
                <div class="device-name">{this.devices[device]?.label}</div>
              </div>
            ))}
            <div class="text">{this.t('You can change the active devices from settings.')}</div>
          </div>
        )}
        {steps.length > 0 && <div class="sub-title">{this.t('How to fix this:')}</div>}
        {steps?.map((step: string) => (
          <div class="recommendation">
            <div>&#8226;</div>
            {this.t(step)}
          </div>
        ))}
        {image !== '' && (
          <video src={`https://cdn.dyte.in/assets/permissions/${image}`} autoPlay muted loop />
        )}
        {this.mediaType !== 'screenshare' && this.permission === 'NOT_REQUESTED' && (
          <dyte-button onClick={() => this.allowPermission()}>Allow Device Permission</dyte-button>
        )}
      </Host>
    );
  }
}
