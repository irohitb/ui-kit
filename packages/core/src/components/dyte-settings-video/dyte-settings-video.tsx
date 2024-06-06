import {
  Component,
  Host,
  h,
  Prop,
  Watch,
  State,
  Event,
  EventEmitter,
  writeTask,
} from '@stencil/core';
import { Meeting, Peer } from '../../types/dyte-client';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Size, States } from '../../types/props';
import { getPreference, setPreference } from '../../utils/user-prefs';
import storeState from '../../lib/store';

/**
 * A component which lets to manage your camera devices and your video preferences.
 *
 * Emits `dyteStateUpdate` event with data for toggling mirroring of self video:
 * ```ts
 * {
 *  prefs: {
 *    mirrorVideo: boolean
 *  }
 * }
 * ```
 */
@Component({
  tag: 'dyte-settings-video',
  styleUrl: 'dyte-settings-video.css',
  shadow: true,
})
export class DyteSettingsVideo {
  /** Meeting object */
  @Prop() meeting: Meeting;

  /** States object */
  @Prop() states: States;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() videoDevices: MediaDeviceInfo[] = [];

  @State() currentDevice: MediaDeviceInfo;

  @State() videoEnabled: boolean;

  /** Emits updated state */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  componentDidLoad() {
    this.meetingChanged(this.meeting);
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting == null) return;

    this.videoEnabled = meeting.self.videoEnabled;
    meeting.self?.addListener('videoUpdate', this.onVideoUpdate);
    meeting.self?.addListener('deviceListUpdate', this.deviceListUpdateListener);
    meeting.self?.addListener('deviceUpdate', this.deviceUpdateListener);

    writeTask(async () => {
      const videoDevices = await meeting.self.getVideoDevices();
      const currentVideoDevice = meeting.self.getCurrentDevices()?.video;
      //  NOTE(callmetarush): Setting current video device to show on top of list

      if (currentVideoDevice != undefined) {
        this.videoDevices = [
          videoDevices.find((device) => device.deviceId === currentVideoDevice.deviceId) ??
            currentVideoDevice,
          ...videoDevices.filter((device) => device.deviceId !== currentVideoDevice.deviceId),
        ];
      } else {
        this.videoDevices = videoDevices;
      }
    });
  }

  disconnectedCallback() {
    this.meeting.self?.removeListener('videoUpdate', this.onVideoUpdate);
    this.meeting?.self.removeListener('deviceListUpdate', this.deviceListUpdateListener);
    this.meeting?.self.removeListener('deviceUpdate', this.deviceUpdateListener);
  }

  private onVideoUpdate = (videoState: Pick<Peer, 'videoEnabled'>) => {
    this.videoEnabled = videoState.videoEnabled;
  };

  private deviceListUpdateListener = ({ devices }) => {
    this.videoDevices = devices.filter((device: MediaDeviceInfo) => device.kind === 'videoinput');
  };

  private deviceUpdateListener = ({ device }) => {
    if (device.kind !== 'videoinput') return;
    this.currentDevice = device;
  };

  private async setDevice(deviceId: string) {
    const device = this.videoDevices.find((d) => d.deviceId === deviceId);
    this.currentDevice = device;

    if (device != null) {
      await this.meeting?.self.setDevice(device);
    }
  }

  render() {
    if (this.meeting == null) return null;

    let unnamedVideoCount = 0;
    const states = this.states || storeState;
    const initialMirrorPreference =
      states?.prefs?.mirrorVideo === true || getPreference('mirror-video') === 'true';

    return (
      <Host>
        <div class="section" part="tile-preview">
          <div class="group" part="tile-preview">
            {this.videoEnabled === true ? (
              <dyte-participant-tile
                meeting={this.meeting}
                participant={this.meeting?.self}
                iconPack={this.iconPack}
                t={this.t}
                states={states}
                size={this.size}
                isPreview
              />
            ) : (
              <div class="camera-off-helper">
                <dyte-participant-tile
                  meeting={this.meeting}
                  participant={this.meeting?.self}
                  size={this.size}
                >
                  <div>
                    <dyte-icon
                      id="icon"
                      icon={this.iconPack.video_off}
                      tabIndex={-1}
                      aria-hidden={true}
                      iconPack={this.iconPack}
                      t={this.t}
                    />
                    <div>{this.t('settings.camera_off')}</div>
                  </div>
                </dyte-participant-tile>
              </div>
            )}
          </div>
        </div>
        <div class="section" part="video-settings">
          <div class="group" part="camera-selection">
            <label>{this.t('camera')}</label>
            <div class="row">
              <select
                class="dyte-select"
                onChange={(e) => this.setDevice((e.target as HTMLSelectElement).value)}
              >
                {this.videoDevices.map(({ deviceId, label }) => (
                  <option selected={this.currentDevice?.deviceId === deviceId} value={deviceId}>
                    {label || `Camera ${++unnamedVideoCount}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div class="group" part="mirror-toggle">
            <div class="row">
              <label htmlFor="mirror-toggle">{this.t('settings.mirror_video')}</label>
              <dyte-switch
                checked={initialMirrorPreference}
                iconPack={this.iconPack}
                t={this.t}
                onDyteChange={(e) => {
                  const { checked } = e.target as HTMLDyteSwitchElement;
                  this.stateUpdate.emit({ prefs: { mirrorVideo: checked } });
                  storeState.prefs = { ...(storeState.prefs ?? {}), mirrorVideo: checked };
                  setPreference('mirror-video', checked);
                }}
              />
            </div>
          </div>
        </div>
      </Host>
    );
  }
}
