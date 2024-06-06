# Dyte UI Kit

Monorepo for all of Dyte's UI Kit packages.

The Dyte UI Kit is a comprehensive library of UI components and utilities designed to simplify the development of video conferencing applications. This repository serves as the core of the Dyte UI Kit, providing a wide range of functionality that can be easily integrated into web-based applications.

Here is a short description for all the packages:

| Path                                     | Description                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)       | The main source code for all Stencil components. You will write code primarily in this directory. |
| [`packages/react`](./packages/react)     | The React UI Kit wrapper package                                                                  |
| [`packages/angular`](./packages/angular) | The Angular UI Kit wrapper package                                                                |
| [`packages/vue`](./packages/react)       | The Vue UI Kit wrapper package                                                                    |

The most important parts of this repository are the [`…/components`](./packages/core/components)  directory, which contains the core UI components, and the …/utils directory, which provides a collection of utility functions and classes that support the UI components.

# Components

- **UI Elements**: Components like [`DyteButton`](/packages/core/src/components/dyte-button/dyte-button.tsx#L22), [`DyteSwitch`](/packages/core/src/components/dyte-switch/dyte-switch.tsx#L13), [`DyteSpinner`](/packages/core/src/components/dyte-spinner/dyte-spinner.tsx#L14), [`DyteTooltip`](/packages/vue-library/src/components.ts#L1414), and [`DyteIcon`](/packages/core/src/components/dyte-icon/dyte-icon.tsx#L24) provide basic UI building blocks.
- **Meeting Controls**: Components like [`DyteCameraToggle`](/packages/core/src/components/dyte-camera-toggle/dyte-camera-toggle.tsx#L17), [`DyteMicToggle`](/packages/core/src/components/dyte-mic-toggle/dyte-mic-toggle.tsx#L17), [`DyteScreenShareToggle`](/packages/core/src/components/dyte-screen-share-toggle/dyte-screen-share-toggle.tsx#L35), [`DyteRecordingToggle`](/packages/core/src/components/dyte-recording-toggle/dyte-recording-toggle.tsx#L21), and [`DyteFullscreenToggle`](/packages/core/src/components/dyte-fullscreen-toggle/dyte-fullscreen-toggle.tsx#L23) allow users to control various aspects of the meeting.
- **Participant Management**: Components like [`DyteParticipant`](/packages/core/src/components/dyte-participant/dyte-participant.tsx#L36), [`DyteParticipantTile`](/packages/core/src/components/dyte-participant-tile/dyte-participant-tile.tsx#L34), [`DyteParticipantsToggle`](/packages/core/src/components/dyte-participants-toggle/dyte-participants-toggle.tsx#L24), and [`DyteParticipantsViewerList`](/packages/vue-library/src/components.ts#L1054) handle the display and management of meeting participants.
- **Chat and Messaging**: Components like [`DyteChat`](/packages/core/src/components/dyte-chat/dyte-chat.tsx#L45), [`DyteChatComposerUi`](/packages/core/src/components/dyte-chat-composer-ui/dyte-chat-composer-ui.tsx#L48), [`DyteChatMessagesUi`](/packages/core/src/components/dyte-chat-messages-ui/dyte-chat-messages-ui.tsx#L26), [`DyteFileMessage`](/packages/core/src/components/dyte-file-message/dyte-file-message.tsx#L15), and [`DyteTextMessage`](/packages/core/src/components/dyte-text-message/dyte-text-message.tsx#L15) provide chat and messaging functionality.
- **Breakout Rooms**: Components like [`DyteBreakoutRoomManager`](/packages/core/src/components/dyte-breakout-room-manager/dyte-breakout-room-manager.tsx#L18), [`DyteBreakoutRoomParticipants`](/packages/core/src/components/dyte-breakout-room-participants/dyte-breakout-room-participants.tsx#L20), and [`DyteBreakoutRoomsToggle`](/packages/core/src/components/dyte-breakout-room-toggle/dyte-breakout-rooms-toggle.tsx#L20) enable the creation and management of breakout rooms.
- **Transcripts and AI**: Components like [`DyteAi`](/packages/core/src/components/dyte-ai/dyte-ai.tsx#L21), [`DyteAiChat`](/packages/core/src/components/dyte-ai-chat/dyte-ai-chat.tsx#L9), [`DyteAiHome`](/packages/core/src/components/dyte-ai-home/dyte-ai-home.tsx#L14), and [`DyteTranscript`](/packages/core/src/components/dyte-transcript/dyte-transcript.tsx#L16) integrate AI-powered features such as transcription and chat assistance.
- **Layouts and Grids**: Components like [`DyteGrid`](/packages/core/src/components/dyte-grid/dyte-grid.tsx#L33), [`DyteMixedGrid`](/packages/core/src/components/dyte-mixed-grid/dyte-mixed-grid.tsx#L23), [`DyteSimpleGrid`](/packages/core/src/components/dyte-simple-grid/dyte-simple-grid.tsx#L21), and [`DyteSpotlightGrid`](/packages/core/src/components/dyte-spotlight-grid/dyte-spotlight-grid.tsx#L25) provide different layout options for displaying participants and content.
- **Modals and Dialogs**: Components like [`DyteConfirmationModal`](/packages/core/src/components/dyte-confirmation-modal/dyte-confirmation-modal.tsx#L16), [`DyteDialog`](/packages/core/src/components/dyte-dialog/dyte-dialog.tsx#L17), [`DyteOverlayModal`](/packages/core/src/components/dyte-overlay-modal/dyte-overlay-modal.tsx#L16), and [`DyteSettingsToggle`](/packages/core/src/components/dyte-settings-toggle/dyte-settings-toggle.tsx#L22) handle various types of modals and dialogs.
- **Notifications and Indicators**: Components like [`DyteNetworkIndicator`](/packages/core/src/components/dyte-network-indicator/dyte-network-indicator.tsx#L13), [`DyteRecordingIndicator`](/packages/core/src/components/dyte-recording-indicator/dyte-recording-indicator.tsx#L18), and [`DyteNotifications`](/packages/core/src/components/dyte-notifications/dyte-notifications.tsx#L61) display network, recording, and notification status.
- **Miscellaneous**: Components like [`DyteLogo`](/packages/core/src/components/dyte-logo/dyte-logo.tsx#L15), [`DyteClock`](/packages/core/src/components/dyte-clock/dyte-clock.tsx#L16), [`DyteCounter`](/packages/core/src/components/dyte-counter/dyte-counter.tsx#L13), and [`DyteDebugger`](/packages/core/src/components/dyte-debugger/dyte-debugger.tsx#L18) provide additional utility and debugging functionality


# Dev Guide

## Installation

```sh
npm i
```

## Run

```sh
npm run dev
```


## Contributing

To get started, you need to first make changes in the `packages/core` directory.
You can find the code for each component in [packages/core/src/components](packages/core/src/components).

You need to `cd` into `packages/core` directory and run `npm start`.

After your changes are made, you need to `cd` to the root and then run `npm run build`, so that the wrapper code also gets updated.

Wrapper code gets updated in the following cases:

- New component is added
- Component props are changed

This is anyway run in the release action, but it is a good practise to keep the source up-to-date.
