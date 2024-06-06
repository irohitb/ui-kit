import DyteClient from '@dytesdk/web-core';
import { showLivestream } from './livestream';

export const FlagsmithFeatureFlags = {
  PLAY_PARTICIPANT_TILE_VIDEO_ON_PAUSE: 'play_participant_tile_video_on_pause',
  DISABLE_EMOJI_PICKER: 'disable_emoji_picker',
  FEAT_PAGINATED_CHAT: 'feat_paginated_chat',
  LOG_PLAYING_FAILURES: 'log_playing_failures',
  FEAT_CHANNEL_CHAT: 'feat_channel_chat',
  DISABLE_KICKING: 'disable_kicking',
  ADMIN_CANTREMOVE_ADMIN: 'admin_cantremove_admin',
  CANTINVITE_VIEWER: 'cantinvite_viewer',
  PINNED_MESSAGES: 'pinned_msgs',
};

export const isBreakoutRoomsEnabled = (meeting: DyteClient) =>
  meeting.connectedMeetings.supportsConnectedMeetings;

export const usePaginatedChat = (meeting: DyteClient) =>
  meeting?.meta.viewType === 'CHAT' ||
  showLivestream(meeting) ||
  meeting?.__internals__?.features.hasFeature('feat_paginated_chat');

export const disableSettingSinkId = (meeting: DyteClient) =>
  meeting?.__internals__?.browserSpecs.isFirefox() &&
  meeting?.__internals__?.features.hasFeature('disable_firefox_setting_sink_id');
