/**
 * Message type constants for chrome.runtime / chrome.tabs messaging.
 * Used by content script, side panel, and popup.
 */
export const MSG = {
  /** Popup/side panel → content script: show or hide the overlay */
  TOGGLE:    'TOGGLE_DRUM_MACHINE',
  /** Popup/side panel → content script: request current state snapshot */
  GET_STATE: 'GET_DRUM_MACHINE_STATE',
  /** Side panel → content script: send a control command */
  COMMAND:   'DRUM_MACHINE_COMMAND',
  /** Content script → popup/side panel: push updated state */
  STATE:     'DRUM_MACHINE_STATE',
}

/**
 * Command action names sent inside a COMMAND message.
 */
export const CMD = {
  PLAY:            'play',
  STOP:            'stop',
  SELECT_AREA:     'select_area',
  CLEAR_AREAS:     'clear_areas',
  SET_BPM:         'set_bpm',
  SET_SPEED:       'set_speed',
  TOGGLE_REDACT:   'toggle_redact',
  SET_REDACT_TYPE: 'set_redact_type',
  SET_OUTPUT_MODE: 'set_output_mode',
  OSC_CONNECT:     'osc_connect',
  OSC_DISCONNECT:  'osc_disconnect',
}
