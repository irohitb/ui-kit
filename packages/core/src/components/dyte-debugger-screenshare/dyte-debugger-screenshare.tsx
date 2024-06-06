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

interface VideoTrackStats {
  isBlackFrame: boolean;
  isFrozenFrame: boolean;
  timestamp: number;
  videoScore: number;
}

type CameraMetadata = {
  label?: string;
  resolution?: number[];
};

@Component({
  tag: 'dyte-debugger-screenshare',
  styleUrl: 'dyte-debugger-screenshare.css',
  shadow: true,
})
export class DyteDebuggerAudio {
  private lowVolCount: number = 0;
  private silenceCount: number = 0;
  private frozenFramesCount: number = 0;
  private blackFramesCount: number = 0;
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

  /** Test Progress Event */
  @Event() testProgress: EventEmitter<number>;

  @State() activeTab: 'Troubleshoot' | 'Report' | 'none' = 'Report';

  @State() stage: number = 0;

  @State() mediaPermission: MediaPermission = 'NOT_REQUESTED';

  @State() screenshareEnabled: boolean = false;

  @State() audioTrackMetadata: MicMetadata = {};

  @State() videoTrackMetadata: CameraMetadata = {};

  @State() screenshareTest: boolean = false;

  @State() audioTrackStats: AudioTrackStats = {
    lowVolume: false,
    clip: false,
    silence: false,
    volume: 0,
    timestamp: 0,
  };

  @State() videoTrackStats: VideoTrackStats = {
    isBlackFrame: false,
    isFrozenFrame: false,
    timestamp: 0,
    videoScore: 0,
  };

  connectedCallback() {
    this.meetingChanged(this.meeting);
    this.updateProgress();
  }

  disconnectedCallback() {
    const { self, troubleshoot } = this.meeting;
    this.screenshareTest && this.toggleScreenshareTest();
    self?.removeListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener);
    self.removeListener('screenShareUpdate', this.screenShareUpdateListener);
    troubleshoot?.screenshare?.removeListener('audioTrackStats', this.audioTrackUpdateListener);
    troubleshoot?.screenshare?.removeListener('videoTrackStats', this.videoTrackUpdateListener);
  }

  @Watch('meeting')
  async meetingChanged(meeting: Meeting) {
    if (!meeting) return;
    const { self, troubleshoot } = meeting;

    self.addListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener.bind(this));
    self.addListener('screenShareUpdate', this.screenShareUpdateListener.bind(this));

    troubleshoot?.screenshare?.on('audioTrackStats', this.audioTrackUpdateListener.bind(this));
    troubleshoot?.screenshare?.on('videoTrackStats', this.videoTrackUpdateListener.bind(this));

    const permission = self?.mediaPermissions?.screenshare;
    this.mediaPermissionUpdateListener({ kind: 'screenshare', message: permission });
    const screenShareEnabled = self?.screenShareEnabled;
    this.screenShareUpdateListener({ screenShareEnabled });
  }

  private mediaPermissionUpdateListener({ kind, message }) {
    if (kind !== 'screenshare') return;
    this.mediaPermission = message;
    if (this.mediaPermission !== 'ACCEPTED') {
      this.stage = 0;
      this.updateProgress();
    }
  }

  private screenShareUpdateListener({ screenShareEnabled }: { screenShareEnabled: boolean }) {
    this.screenshareEnabled = screenShareEnabled;
    if (!this.screenshareEnabled && this.screenshareTest) this.toggleScreenshareTest();
  }

  private audioTrackUpdateListener(stats) {
    this.audioTrackStats = { ...stats, volume: this.normalizeVolume(stats?.volume) };
  }

  private videoTrackUpdateListener(stats) {
    this.videoTrackStats = { ...stats, videoScore: this.normalizeVideoScore(stats?.videoScore) };
  }

  private async toggleScreenshareTest() {
    this.screenshareTest = !this.screenshareTest;
    const troubleshooter = this.meeting?.troubleshoot.screenshare;
    if (this.screenshareTest && this.screenshareEnabled) {
      this.audioTrackMetadata = troubleshooter?.getAudioTrackMetaData() ?? {};
      this.videoTrackMetadata = troubleshooter?.getVideoTrackMetaData() ?? {};
      await troubleshooter.startAudioTrackAnalysis();
      await troubleshooter.startVideoTrackAnalysis();
    } else {
      troubleshooter?.stopAudioTrackAnalysis();
      troubleshooter?.stopVideoTrackAnalysis();
    }
  }

  private setActiveTab(state: 'Troubleshoot' | 'Report' | 'none') {
    this.activeTab = state;
    this.updateProgress();
  }

  private changeStage(stage: number) {
    if (this.mediaPermission !== 'ACCEPTED') return;
    stage = Math.max(0, stage);
    stage = Math.min(1, stage);
    this.stage = stage;
    this.updateProgress();
    if (this.screenshareTest) this.toggleScreenshareTest();
  }

  private updateProgress() {
    if (this.activeTab === 'Troubleshoot') {
      this.testProgress.emit(((this.stage + 1) * 100) / 2);
    } else this.testProgress.emit(0);
  }

  private getDeviceInformationStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';

    if (this.audioTrackMetadata) {
      const {
        channelCount: count,
        channelInterpretation: mode,
        channelType: type,
        outputs,
      } = this.audioTrackMetadata;

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
    }

    return (
      <div class={`row status-text ${style}`}>
        <dyte-icon size="sm" icon={this.iconPack[icon]}></dyte-icon>
        {this.t(message)}
      </div>
    );
  }

  private getAudioAnalysisStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';

    if (!this.audioTrackMetadata?.label)
      return (
        <div class={`row status-text warning`}>
          <dyte-icon size="sm" icon={this.iconPack.warning}></dyte-icon>
          {this.t('Not Available')}
        </div>
      );

    if (this.detectLowVolume()) {
      message = 'Low volume detected.';
      icon = 'warning';
      style = 'warning';
    }

    if (this.audioTrackStats.clip) {
      message = 'Your audio may be noisy.';
      icon = 'warning';
      style = 'error';
    }

    if (this.detectSilence()) {
      message = 'Silence detected.';
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

  private getVideoAnalysisStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';

    if (this.videoTrackStats?.isBlackFrame) {
      this.blackFramesCount++;
    } else {
      this.blackFramesCount = 0;
    }

    if (this.videoTrackStats?.isFrozenFrame) {
      this.frozenFramesCount++;
    } else {
      this.frozenFramesCount = 0;
    }

    if (this.frozenFramesCount > 4) {
      message = 'Looks like the video is frozen.';
      icon = 'warning';
      style = 'error';
    }

    if (this.blackFramesCount > 4) {
      message = 'Video is not being processed by the camera.';
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

  private formatLabel(camelCaseLabel: string) {
    const result = camelCaseLabel.replace(/([A-Z])/g, ' $1');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private nullToStr(val: string | null) {
    if (!val) return 'Not Available';
    return val;
  }

  private normalizeVolume(val = 0) {
    let max = 0.3;
    const min = 0.001;
    if (val > max) max = val;
    return Math.max(5, Math.round((val * 100) / (max - min)));
  }

  private normalizeVideoScore(val = 0) {
    let max = 1;
    const min = 0;
    if (val > max) max = val;
    return Math.max(5, Math.round((val * 10) / (max - min)));
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

    return (
      <Host>
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
              <div class="stage-indicator">Step {this.stage + 1}/2</div>

              {/* Stage 0: Permissions */}
              {this.stage === 0 && (
                <dyte-debugger-permissions-ui
                  {...defaults}
                  mediaType="screenshare"
                ></dyte-debugger-permissions-ui>
              )}
              {/* Stage 1: System Checks */}
              {this.stage === 1 &&
                (this.screenshareEnabled ? (
                  <div class="col">
                    <div class="text">
                      {/* TODO: change this */}
                      Contrary to popular belief, Lorem Ipsum is not simply random text. It has
                      roots.
                    </div>
                    <dyte-button onClick={() => this.toggleScreenshareTest()}>
                      {this.screenshareTest ? 'Stop' : 'Start'} Screenshare Tests
                    </dyte-button>
                    {this.screenshareTest && (
                      <div>
                        {/* Device Information */}
                        <div class="sub-title">
                          Device Information
                          <dyte-information-tooltip>
                            <div slot="tootlip-text" class="tooltip-text">
                              {Object.keys(this.audioTrackMetadata).map((key) => {
                                if (key === 'label') return;
                                return (
                                  <div>
                                    Audio {this.formatLabel(key)}:{' '}
                                    <span>{this.audioTrackMetadata[key]}</span>
                                  </div>
                                );
                              })}

                              {Object.keys(this.videoTrackMetadata).map((key) => {
                                if (key === 'label') return;
                                return (
                                  <div>
                                    Video {this.formatLabel(key)}:{' '}
                                    <span>{JSON.stringify(this.videoTrackMetadata[key])}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </dyte-information-tooltip>
                        </div>
                        <div class="row align-start">
                          <div class="label">
                            <span>Audio Label</span>:
                          </div>
                          <div class="text">{this.nullToStr(this.audioTrackMetadata?.label)}</div>
                        </div>
                        <div class="row align-start">
                          <div class="label">
                            <span>Video Label</span>:
                          </div>
                          <div class="text">{this.nullToStr(this.videoTrackMetadata?.label)}</div>
                        </div>
                        {this.getDeviceInformationStatus()}

                        {/* Device Analysis */}
                        <div class="sub-title">Device Analysis</div>
                        <div class="row ">
                          <div class="label">
                            <span>Audio Analysis</span> :
                          </div>
                          {this.getAudioAnalysisStatus()}
                        </div>
                        <div class="row">
                          <div class="label">
                            <span>Video Analysis</span> :
                          </div>
                          {this.getVideoAnalysisStatus()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div class="col">
                    <div class="info">
                      <dyte-icon size="sm" icon={this.iconPack.warning} />
                      You are not sharing your screen.
                    </div>
                    <div class="text">
                      In order for us to test your screenshare, you need to be sharing your screen.
                      You can enable screenshare from the control bar.
                    </div>
                  </div>
                ))}
            </div>
            {/* Prev/Next */}
            <div class="stage-manager">
              {this.stage < 1 && (
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
            <dyte-debugger-issues-ui
              {...defaults}
              mediaType="screenshare"
            ></dyte-debugger-issues-ui>
          </div>
        )}
      </Host>
    );
  }
}
