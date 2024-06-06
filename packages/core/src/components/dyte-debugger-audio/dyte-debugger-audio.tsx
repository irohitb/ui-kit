import { Component, Host, Prop, h, State, Watch, Event, EventEmitter } from '@stencil/core';
import { States, Size, IconPack, defaultIconPack, DyteI18n } from '../../exports';
import { useLanguage } from '../../lib/lang';
import { MediaPermission, Meeting } from '../../types/dyte-client';
import storeState from '../../lib/store';
import { MicMetadata } from '@dytesdk/web-core';

interface AudioTrackStats {
  lowVolume: boolean;
  clip: boolean;
  volume: number;
  timestamp: number;
  silence: boolean;
}

@Component({
  tag: 'dyte-debugger-audio',
  styleUrl: 'dyte-debugger-audio.css',
  shadow: true,
})
export class DyteDebuggerAudio {
  private volumeEl: HTMLDivElement;
  private testAudioEl: HTMLAudioElement;
  private lowVolCount: number = 0;
  private silenceCount: number = 0;

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

  @State() micMetadata: MicMetadata = {};

  @State() micPreview: boolean = false;

  @State() speakerPreview: boolean = false;

  @State() audioTrackStats: AudioTrackStats = {
    lowVolume: false,
    clip: false,
    silence: false,
    volume: 0,
    timestamp: 0,
  };

  @State() activeTab: 'Troubleshoot' | 'Report' | 'none' = 'Report';

  @State() stage: number = 0;

  @State() mediaPermission: MediaPermission = 'NOT_REQUESTED';

  @State() speakerDevice: MediaDeviceInfo;

  @State() speakerTest: 'none' | 'success' | 'failed' = 'none';

  /** Test Progress Event */
  @Event() testProgress: EventEmitter<number>;

  connectedCallback() {
    this.meetingChanged(this.meeting);
    this.updateProgress();
  }

  disconnectedCallback() {
    const { self, troubleshoot } = this.meeting;
    this.micPreview && this.toggleMicTest();
    this.speakerPreview && this.toggleSpeakerTest();

    self?.removeListener('deviceUpdate', this.deviceUpdateListener);
    self?.removeListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener);
    troubleshoot?.audio?.removeListener('audioTrackStats', this.audioTrackUpdateListener);
  }

  @Watch('meeting')
  async meetingChanged(meeting: Meeting) {
    if (!meeting) return;
    const { self, troubleshoot } = meeting;
    if (self?.audioTrack) {
      await this.getTrackInfo();
    }
    self?.on('deviceUpdate', this.deviceUpdateListener.bind(this));
    self.addListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener.bind(this));
    const permission = self?.mediaPermissions?.audio;
    this.mediaPermissionUpdateListener({ kind: 'audio', message: permission });
    troubleshoot?.audio?.on('audioTrackStats', this.audioTrackUpdateListener.bind(this));
  }

  private deviceUpdateListener({ device, preview }) {
    if (preview) return;
    if (device.kind === 'audioInput') this.speakerDevice = device;
    if (device.kind === 'audiooutput') this.getTrackInfo();
  }

  private mediaPermissionUpdateListener({ kind, message }) {
    if (kind !== 'audio') return;
    this.mediaPermission = message;
    if (this.mediaPermission !== 'ACCEPTED') {
      this.stage = 0;
      this.updateProgress();
      if (this.micPreview) this.toggleMicTest();
      if (this.speakerPreview) this.toggleSpeakerTest();
    }
  }

  private audioTrackUpdateListener(data: any) {
    this.audioTrackStats = { ...data, volume: this.normalizeVolume(data?.volume) };
    if (this.volumeEl) this.volumeEl.style.width = `${this.audioTrackStats.volume}%`;
  }

  private setActiveTab(state: 'Troubleshoot' | 'Report' | 'none') {
    this.activeTab = state;
    this.updateProgress();
  }

  private async toggleMicTest() {
    const troubleshooter = this.meeting.troubleshoot?.audio;
    this.micPreview = !this.micPreview;
    if (this.micPreview) {
      await this.getTrackInfo();
      troubleshooter.stopTrackAnalysis();
      await troubleshooter?.startTrackAnalysis(true);
    } else {
      this.meeting.troubleshoot?.audio?.stopTrackAnalysis();
      this.audioTrackStats.volume = 0;
      if (this.volumeEl) this.volumeEl.style.width = '5%';
    }
  }

  private async toggleSpeakerTest() {
    const troubleshooter = this.meeting.troubleshoot?.audio;
    if (this.testAudioEl?.paused) {
      this.testAudioEl.currentTime = 0.2;
      this.testAudioEl?.play();
      this.speakerPreview = true;
      troubleshooter?.startTrackAnalysis(true);
      this.testAudioEl.addEventListener('ended', () => {
        this.speakerPreview = false;
        troubleshooter?.stopTrackAnalysis();
      });
    } else {
      this.testAudioEl?.pause();
      this.speakerPreview = false;
      troubleshooter?.stopTrackAnalysis();
    }

    if (this.speakerPreview) {
      const { self } = this.meeting;
      const speakerDevices = await self?.getSpeakerDevices();
      if (!speakerDevices) return;
      this.speakerDevice = speakerDevices[0];
      self?.setDevice(speakerDevices[0]);
    }
  }

  private async getTrackInfo() {
    this.micMetadata = await this.meeting.troubleshoot?.audio?.getTrackMetadata(true);
  }

  private changeStage(stage: number) {
    if (this.mediaPermission !== 'ACCEPTED') return;
    stage = Math.max(0, stage);
    stage = Math.min(2, stage);
    this.stage = stage;
    this.updateProgress();
    if (this.micPreview) this.toggleMicTest();
    if (this.speakerPreview) this.toggleSpeakerTest();
  }

  private updateProgress() {
    if (this.activeTab === 'Troubleshoot') {
      this.testProgress.emit(((this.stage + 1) * 100) / 3);
    } else this.testProgress.emit(0);
  }

  private getAudioLevelStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';

    if (this.detectLowVolume()) {
      message = 'Low volume detected, please move closer to the device.';
      icon = 'warning';
      style = 'warning';
    }

    if (this.audioTrackStats.clip) {
      message = 'Clipping detected. Your audio may be noisy.';
      icon = 'warning';
      style = 'error';
    }

    if (this.detectSilence()) {
      message = 'Silence detected. Your device is not picking up audio.';
      icon = 'warning';
      style = 'error';
    }
    return (
      <div class={`row status-text ${style}`}>
        <dyte-icon size="sm" icon={this.iconPack[icon]}></dyte-icon>
        {this.t(message)}
      </div>
    );
  }

  private getDeviceInformationStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';

    const {
      channelCount: count,
      channelInterpretation: mode,
      channelType: type,
      outputs,
    } = this.micMetadata;

    if (mode === 'discrete' && outputs > count) {
      message = 'Audio quality might be degraded.';
      icon = 'warning';
      style = 'warning';
    } else if (
      (type === 'STEREO' && outputs === 1) ||
      (type === 'QUAD' && outputs === 1) ||
      (type === 'QUAD' && outputs === 2)
    ) {
      message = 'Audio quality might be degraded.';
      icon = 'warning';
      style = 'warning';
    }

    if (
      (type === 'MONO' && count < 1) ||
      (type === 'STEREO' && count < 2) ||
      (type === 'QUAD' && count < 4)
    ) {
      message = 'Looks like your device is not functioning properly.';
      icon = 'warning';
      style = 'error';
    }

    return (
      <div class={`row status-text ${style}`}>
        <dyte-icon size="sm" icon={this.iconPack[icon]}></dyte-icon>
        {this.t(message)}
      </div>
    );
  }

  private getSpeakerTestStatus() {
    if (this.speakerTest === 'success') return 'All systems are functional.';
    if (this.speakerTest === 'failed')
      return 'Test failed. Please ensure your system volume is not 0.';
  }

  private setSpeakerTestResult(status: 'none' | 'success' | 'failed') {
    if (this.speakerPreview) this.toggleSpeakerTest();
    this.speakerTest = status;
  }

  private boolToStr(val: boolean) {
    if (val) return 'Yes';
    return 'No';
  }

  private formatLabel(camelCaseLabel: string) {
    const result = camelCaseLabel.replace(/([A-Z])/g, ' $1');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private normalizeVolume(val = 0) {
    let max = 0.3;
    const min = 0.001;
    if (val > max) max = val;
    return Math.max(5, Math.round((val * 100) / (max - min)));
  }

  private detectLowVolume() {
    if (this.audioTrackStats?.lowVolume) {
      this.lowVolCount++;
    } else {
      this.lowVolCount = 0;
    }
    return this.lowVolCount > 10;
  }

  private detectSilence() {
    if (this.audioTrackStats?.silence) {
      this.silenceCount++;
    } else {
      this.silenceCount = 0;
    }
    return this.silenceCount > 5;
  }

  render() {
    const defaults = {
      meeting: this.meeting,
      states: this.states || storeState,
      iconPack: this.iconPack,
      t: this.t,
      size: this.size,
    };
    const deviceInfoKeys = ['label', 'channelType'];

    return (
      <Host>
        <audio
          preload="auto"
          src="https://assets.dyte.io/ui-kit/speaker-test.mp3"
          ref={(el) => (this.testAudioEl = el)}
        />
        <div id="header">
          {['Report', 'Troubleshoot'].map((section: any) => (
            <dyte-button
              key={section}
              variant="ghost"
              class={{ active: this.activeTab === section }}
              onClick={() => this.setActiveTab(section)}
              iconPack={this.iconPack}
              t={this.t}
            >
              {this.t(section)}
            </dyte-button>
          ))}
        </div>
        {this.activeTab === 'Troubleshoot' && (
          <div class="tab-body">
            <div>
              <div class="stage-indicator">Step {this.stage + 1}/3</div>
              {/* Stage 0: Permissions UI */}
              {this.stage === 0 && (
                <dyte-debugger-permissions-ui
                  {...defaults}
                  mediaType="audio"
                ></dyte-debugger-permissions-ui>
              )}
              {/* Stage 1: System Checks UI */}
              {this.stage === 1 && (
                <div>
                  <div class="title">Microphone Test</div>
                  <div class="text">
                    {this.t(
                      'Please start the microphone test and start speaking in order to test your audio device.'
                    )}
                  </div>
                  <dyte-button size="md" onClick={() => this.toggleMicTest()}>
                    {this.micPreview ? 'Stop' : 'Start'} Microphone Test
                  </dyte-button>
                  {this.micPreview && (
                    <div class="col">
                      {/* Device Information */}
                      <div class="sub-title">
                        Device Information
                        <dyte-information-tooltip iconPack={this.iconPack}>
                          <div slot="tootlip-text" class="tooltip-text">
                            {Object.keys(this.micMetadata).map((key) => (
                              <div>
                                {this.formatLabel(key)}: <span>{this.micMetadata[key]}</span>
                              </div>
                            ))}
                          </div>
                        </dyte-information-tooltip>
                      </div>
                      {deviceInfoKeys.map((key) => {
                        const val = this.micMetadata[key];
                        if (!val) return;
                        return (
                          <div class="row">
                            <div class="label">
                              <span>{this.t(this.formatLabel(key))}</span>:
                            </div>
                            <div class="text">{this.t(val)}</div>
                          </div>
                        );
                      })}
                      {this.getDeviceInformationStatus()}
                      {/* Track Information */}
                      <div class="sub-title">
                        Audio Level Analysis
                        <dyte-information-tooltip iconPack={this.iconPack}>
                          <div slot="tootlip-text" class="tooltip-text">
                            <div>
                              Volume Level:<span>{this.audioTrackStats.volume}/100</span>
                            </div>
                            <div>
                              Low Volume:
                              <span>{this.boolToStr(this.audioTrackStats.lowVolume)}</span>
                            </div>
                            <div>
                              Silence Detected:
                              <span>{this.boolToStr(this.audioTrackStats.silence)}</span>
                            </div>
                            <div>
                              Noise Detected:
                              <span>{this.boolToStr(this.audioTrackStats.clip)}</span>
                            </div>
                            <div>
                              Time:
                              <span>
                                {new Date(this.audioTrackStats.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </dyte-information-tooltip>
                      </div>
                      <div class="row">
                        <dyte-icon icon={this.iconPack.speaker} size="md" />
                        <div class="volume-indicator">
                          <div class="volume-level" ref={(el) => (this.volumeEl = el)}></div>
                        </div>
                      </div>
                      {this.getAudioLevelStatus()}
                    </div>
                  )}
                </div>
              )}
              {/* Stage 2: Speaker Tests UI */}
              {this.stage === 2 && (
                <div class="col">
                  <div class="title">Speaker Test</div>
                  <div class="text">
                    {this.t(
                      'Upon starting this test, an audio will be played. Please ensure your system volume is not set to zero.'
                    )}
                  </div>
                  <dyte-button onClick={() => this.toggleSpeakerTest()} size="md">
                    {this.speakerPreview ? 'Stop' : 'Start'} Speaker Test
                  </dyte-button>
                  {this.speakerDevice && (
                    <div>
                      <div class="sub-title">Device Information</div>
                      <div class="row">
                        <div class="label">
                          <span>Label</span>:
                        </div>
                        <div class="text">{this.speakerDevice.label}</div>
                      </div>
                    </div>
                  )}
                  {this.speakerPreview && (
                    <div>
                      <p class="sub-title">Are you able to hear the audio?</p>
                      <div class="speaker-test">
                        <dyte-button
                          onClick={() => this.setSpeakerTestResult('success')}
                          size="sm"
                          variant="primary"
                        >
                          Yes
                        </dyte-button>
                        <dyte-button
                          onClick={() => this.setSpeakerTestResult('failed')}
                          size="sm"
                          variant="secondary"
                        >
                          No
                        </dyte-button>
                      </div>
                    </div>
                  )}
                  {!this.speakerPreview && this.speakerTest !== 'none' && (
                    <div class={`row status-text ${this.speakerTest}`}>
                      <dyte-icon
                        size="sm"
                        icon={
                          this.iconPack[this.speakerTest === 'failed' ? 'dismiss' : 'checkmark']
                        }
                      ></dyte-icon>
                      {this.getSpeakerTestStatus()}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Prev and Next buttons */}
            <div class="stage-manager">
              {this.stage < 2 && (
                <div
                  class={{ 'stage-button': true, disabled: this.mediaPermission !== 'ACCEPTED' }}
                  onClick={() => this.changeStage(this.stage + 1)}
                >
                  Next
                  <dyte-icon size="sm" icon={this.iconPack.chevron_right} />
                </div>
              )}
              {this.stage > 0 && (
                <div
                  class={{ 'stage-button': true, disabled: this.mediaPermission !== 'ACCEPTED' }}
                  onClick={() => this.changeStage(this.stage - 1)}
                >
                  <dyte-icon size="sm" icon={this.iconPack.chevron_left} />
                  Prev
                </div>
              )}
            </div>
          </div>
        )}
        {this.activeTab === 'Report' && (
          <div class="tab-body">
            <dyte-debugger-issues-ui {...defaults} mediaType="audio"></dyte-debugger-issues-ui>
          </div>
        )}
      </Host>
    );
  }
}
