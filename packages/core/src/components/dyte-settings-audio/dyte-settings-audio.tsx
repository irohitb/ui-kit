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
import { Meeting } from '../../types/dyte-client';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Size, States } from '../../types/props';
import { getPreference, setPreference } from '../../utils/user-prefs';
import storeState from '../../lib/store';
import { disableSettingSinkId } from '../../utils/flags';

/**
 * A component which lets to manage your audio devices and audio preferences.
 *
 * Emits `dyteStateUpdate` event with data for muting notification sounds:
 * ```ts
 * {
 *  prefs: {
 *    muteNotificationSounds: boolean
 *  }
 * }
 * ```
 */
@Component({
  tag: 'dyte-settings-audio',
  styleUrl: 'dyte-settings-audio.css',
  shadow: true,
})
export class DyteSettingsAudio {
  private testAudioEl: HTMLAudioElement;

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

  @State() audioDevices: MediaDeviceInfo[] = [];
  @State() speakerDevices: MediaDeviceInfo[] = [];
  @State() canProduceAudio: boolean = true;
  @State() currentDevices: {
    audio: MediaDeviceInfo;
    speaker: MediaDeviceInfo;
  } = { audio: undefined, speaker: undefined };

  /** Event updated state */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  connectedCallback() {
    this.meetingChanged(this.meeting);
  }

  disconnectedCallback() {
    this.meeting?.stage?.removeListener('stageStatusUpdate', this.stageStateListener);
    this.meeting?.self.removeListener('deviceListUpdate', this.deviceListUpdateListener);
    this.meeting?.self.removeListener('deviceUpdate', this.deviceUpdateListener);
  }

  private stageStateListener = () => {
    this.canProduceAudio = this.meeting.self.permissions.canProduceAudio === 'ALLOWED';
  };

  private deviceListUpdateListener = ({ devices }) => {
    const result = devices.reduce(
      (res: { [kind: string]: MediaDeviceInfo[] }, device: MediaDeviceInfo) => {
        res[device.kind]?.push(device);
        return res;
      },
      { audioinput: [], audiooutput: [] }
    );
    this.audioDevices = result.audioinput;
    this.speakerDevices = result.audiooutput;
  };

  private deviceUpdateListener = ({ device }) => {
    if (device.kind === 'audioinput') {
      this.currentDevices = {
        ...this.currentDevices,
        audio: device,
      };
    }
    if (device.kind === 'audiooutput') {
      this.currentDevices = {
        ...this.currentDevices,
        speaker: device,
      };
    }
  };

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting == null) return;

    writeTask(async () => {
      const { self, stage } = meeting;
      const audioDevices = await meeting.self.getAudioDevices();
      const speakerDevices = await meeting.self.getSpeakerDevices();
      const currentAudioDevice = meeting.self.getCurrentDevices()?.audio;
      const currentSpeakerDevice = meeting.self.getCurrentDevices()?.speaker;
      this.currentDevices = {
        audio: currentAudioDevice,
        speaker: currentSpeakerDevice,
      };
      this.canProduceAudio = this.meeting.self.permissions.canProduceAudio === 'ALLOWED';

      stage?.addListener('stageStatusUpdate', this.stageStateListener);
      self.addListener('deviceListUpdate', this.deviceListUpdateListener);
      self.addListener('deviceUpdate', this.deviceUpdateListener);

      if (currentAudioDevice != undefined) {
        this.audioDevices = [
          audioDevices.find((device) => device.deviceId === currentAudioDevice.deviceId) ??
            currentAudioDevice,
          ...audioDevices.filter((device) => device.deviceId !== currentAudioDevice.deviceId),
        ];
      } else {
        this.audioDevices = audioDevices;
      }

      if (currentSpeakerDevice != undefined) {
        this.speakerDevices = [
          speakerDevices.find((device) => device.deviceId === currentSpeakerDevice.deviceId) ??
            currentSpeakerDevice,
          ...speakerDevices.filter((device) => device.deviceId !== currentSpeakerDevice.deviceId),
        ];
      } else {
        this.speakerDevices = speakerDevices;
      }
    });
  }

  private testAudio() {
    this.testAudioEl?.play();
  }

  private setDevice(kind: 'audio' | 'speaker', deviceId) {
    if (disableSettingSinkId(this.meeting)) return;
    const device =
      kind === 'audio'
        ? this.audioDevices.find((d) => d.deviceId === deviceId)
        : this.speakerDevices.find((d) => d.deviceId === deviceId);

    this.currentDevices = {
      ...this.currentDevices,
      [kind]: device,
    };

    if (device != null) {
      this.meeting?.self.setDevice(device);
      if (device.kind === 'audiooutput') {
        (this.testAudioEl as any)?.setSinkId(device.deviceId);
      }
    }
  }

  render() {
    if (this.meeting == null) return null;

    let unnamedMicCount = 0;
    let unnamedSpeakerCount = 0;
    const states = this.states || storeState;
    const initialNotificationSoundsPreference =
      states?.prefs?.muteNotificationSounds === true ||
      getPreference('mute-notification-sounds') === 'true';

    return (
      <Host>
        <audio
          preload="auto"
          src="https://assets.dyte.io/ui-kit/speaker-test.mp3"
          ref={(el) => (this.testAudioEl = el)}
        />
        {this.canProduceAudio && (
          <div class="group" part="microphone-selection">
            <label>{this.t('settings.microphone_input')}</label>
            <div class="row">
              <select
                class="dyte-select"
                onChange={(e) => this.setDevice('audio', (e.target as HTMLSelectElement).value)}
              >
                {this.audioDevices.map(({ deviceId, label }) => (
                  <option
                    value={deviceId}
                    selected={this.currentDevices.audio?.deviceId === deviceId}
                  >
                    {label || `Microphone ${++unnamedMicCount}`}
                  </option>
                ))}
              </select>
              <dyte-audio-visualizer
                participant={this.meeting?.self}
                iconPack={this.iconPack}
                t={this.t}
              />
            </div>
          </div>
        )}

        <div class="group" part="speaker-selection">
          {this.speakerDevices.length > 0 && !disableSettingSinkId(this.meeting) && (
            <div>
              <label>{this.t('settings.speaker_output')}</label>
              <div class="row">
                <select
                  class="dyte-select"
                  onChange={(e) => this.setDevice('speaker', (e.target as HTMLSelectElement).value)}
                >
                  {this.speakerDevices.map(({ deviceId, label }) => (
                    <option
                      value={deviceId}
                      selected={this.currentDevices.speaker?.deviceId === deviceId}
                    >
                      {label || `Speaker ${++unnamedSpeakerCount}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <dyte-button
            variant="secondary"
            onClick={() => this.testAudio()}
            iconPack={this.iconPack}
            t={this.t}
          >
            <dyte-icon
              icon={this.iconPack.speaker}
              slot="start"
              iconPack={this.iconPack}
              t={this.t}
            />
            {this.t('test')}
          </dyte-button>
        </div>
        <div class="group" part="notification-toggle">
          <div class="row">
            <label htmlFor="notification-toggle">{this.t('settings.notification_sound')}</label>
            <dyte-switch
              id="notification-toggle"
              checked={!initialNotificationSoundsPreference}
              onDyteChange={(e: CustomEvent<boolean>) => {
                const { checked } = e.target as HTMLDyteSwitchElement;
                const muteNotificationSounds = !checked;
                this.stateUpdate.emit({ prefs: { muteNotificationSounds } });
                storeState.prefs = { ...(storeState.prefs ?? {}), muteNotificationSounds };
                setPreference('mute-notification-sounds', muteNotificationSounds);
              }}
              iconPack={this.iconPack}
              t={this.t}
            />
          </div>
        </div>
      </Host>
    );
  }
}
