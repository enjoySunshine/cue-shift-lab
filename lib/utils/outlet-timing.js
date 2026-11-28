/**
 * mux.js
 *
 * Copyright (c) Brightcove
 *
 * Timing of timed cues (subtitles and song titles) on the three live
 * outlets: video on demand, playback and low latency.
 *
 * Cues are carried on a 90kHz presentation timestamp clock. A segment has a
 * segment start (timelineStartPts). Two modes of request are supported:
 *
 * - ALIGN_TO_SEGMENT subtracts the segment start, so cue time is relative to
 *   the segment.
 * - KEEP_ORIGINAL_TIMESTAMPS keeps the raw presentation timestamp.
 *
 * Both are handed out in seconds. For a segment starting at 90000 with a cue
 * drawn from 180000 to 270000 the required answers are:
 *
 * - KEEP_ORIGINAL_TIMESTAMPS: start 2, end 3
 * - ALIGN_TO_SEGMENT:         start 1, end 2
 *
 * When no mode is requested each outlet keeps its historical behavior. The
 * historical behavior is wrong in two places that must stay untouched without
 * an explicit request: playback always aligns, and a low latency song title
 * always keeps the original timestamps.
 */
const clock = require('./clock');

const OUTLETS = {
  VOD: 'vod',
  PLAYBACK: 'playback',
  LOW_LATENCY: 'lowLatency'
};

const CUE_TYPES = {
  SUBTITLE: 'subtitle',
  SONG_TITLE: 'songTitle'
};

const MODES = {
  ALIGN_TO_SEGMENT: 'alignToSegment',
  KEEP_ORIGINAL_TIMESTAMPS: 'keepOriginalTimestamps'
};

// What an outlet does when no mode is requested. Low latency subtitles and
// the whole vod outlet honor the request they receive; the playback outlet
// historically has no mode distinction, and a low latency song title
// historically keeps the original timestamps.
const LEGACY_DEFAULT_MODES = {};

LEGACY_DEFAULT_MODES[OUTLETS.PLAYBACK + ':' + CUE_TYPES.SUBTITLE] =
  MODES.ALIGN_TO_SEGMENT;
LEGACY_DEFAULT_MODES[OUTLETS.PLAYBACK + ':' + CUE_TYPES.SONG_TITLE] =
  MODES.ALIGN_TO_SEGMENT;
LEGACY_DEFAULT_MODES[OUTLETS.LOW_LATENCY + ':' + CUE_TYPES.SUBTITLE] =
  MODES.ALIGN_TO_SEGMENT;
LEGACY_DEFAULT_MODES[OUTLETS.LOW_LATENCY + ':' + CUE_TYPES.SONG_TITLE] =
  MODES.KEEP_ORIGINAL_TIMESTAMPS;
LEGACY_DEFAULT_MODES[OUTLETS.VOD + ':' + CUE_TYPES.SUBTITLE] =
  MODES.ALIGN_TO_SEGMENT;
LEGACY_DEFAULT_MODES[OUTLETS.VOD + ':' + CUE_TYPES.SONG_TITLE] =
  MODES.ALIGN_TO_SEGMENT;

/**
 * Pick the effective mode for an outlet and cue type.
 *
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {string} one of MODES
 */
const resolveMode = function(outlet, cueType, request) {
  if (request === MODES.ALIGN_TO_SEGMENT ||
      request === MODES.KEEP_ORIGINAL_TIMESTAMPS) {
    // An explicit request overrides the per-outlet legacy behavior.
    return request;
  }

  const key = outlet + ':' + cueType;

  if (!Object.prototype.hasOwnProperty.call(LEGACY_DEFAULT_MODES, key)) {
    throw new Error('Unknown outlet/cue type: ' + key);
  }

  return LEGACY_DEFAULT_MODES[key];
};

/**
 * Approach 1.
 *
 * Keep the raw pts and, on each outlet, decide per request whether the
 * segment start is subtracted before converting to seconds.
 *
 * @param {number} pts the raw 90kHz cue timestamp
 * @param {number} segmentStartPts the 90kHz timestamp of the segment start
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {number} cue time in seconds
 */
const cueTimeToSeconds = function(pts, segmentStartPts, outlet, cueType, request) {
  const mode = resolveMode(outlet, cueType, request);

  return clock.metadataTsToSeconds(
    pts,
    segmentStartPts,
    mode === MODES.KEEP_ORIGINAL_TIMESTAMPS
  );
};

/**
 * Convert both ends of a cue with approach 1.
 *
 * @param {Object} cue cue with raw startPts and endPts values
 * @param {number} segmentStartPts the 90kHz timestamp of the segment start
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {{start: number, end: number}} cue start and end in seconds
 */
const cueToSeconds = function(cue, segmentStartPts, outlet, cueType, request) {
  return {
    start: cueTimeToSeconds(cue.startPts, segmentStartPts, outlet, cueType, request),
    end: cueTimeToSeconds(cue.endPts, segmentStartPts, outlet, cueType, request)
  };
};

/**
 * Approach 2.
 *
 * Resolve the request first and convert the raw pts into one shared set of
 * seconds that every outlet hands out unchanged. When aligned, the segment
 * start is removed before the shared conversion, so subtracting it again per
 * outlet would subtract it twice.
 *
 * @param {number} pts the raw 90kHz cue timestamp
 * @param {number} segmentStartPts the 90kHz timestamp of the segment start
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {number} a pts expressed against the clock implied by the request
 */
const normalizeCuePts = function(pts, segmentStartPts, outlet, cueType, request) {
  const mode = resolveMode(outlet, cueType, request);

  return mode === MODES.ALIGN_TO_SEGMENT ? pts - segmentStartPts : pts;
};

/**
 * Convert a normalized pts to seconds without subtracting the segment start
 * again.
 *
 * @param {number} pts the raw 90kHz cue timestamp
 * @param {number} segmentStartPts the 90kHz timestamp of the segment start
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {number} cue time in seconds
 */
const normalizedCueTimeToSeconds = function(pts, segmentStartPts, outlet, cueType, request) {
  const normalizedPts =
    normalizeCuePts(pts, segmentStartPts, outlet, cueType, request);

  // The pts is already on the requested clock, so the segment start must not
  // be subtracted a second time.
  return clock.videoTsToSeconds(normalizedPts);
};

/**
 * Convert both ends of a cue with approach 2.
 *
 * @param {Object} cue cue with raw startPts and endPts values
 * @param {number} segmentStartPts the 90kHz timestamp of the segment start
 * @param {string} outlet one of OUTLETS
 * @param {string} cueType one of CUE_TYPES
 * @param {string} [request] optional one of MODES
 * @return {{start: number, end: number}} cue start and end in seconds
 */
const normalizedCueToSeconds = function(cue, segmentStartPts, outlet, cueType, request) {
  return {
    start: normalizedCueTimeToSeconds(cue.startPts, segmentStartPts, outlet, cueType, request),
    end: normalizedCueTimeToSeconds(cue.endPts, segmentStartPts, outlet, cueType, request)
  };
};

/**
 * The playlist declares the seconds an outlet must emit. Reject the pair when
 * the declared value and the outlet value disagree in either direction.
 *
 * @param {{start: number, end: number}} playlistCue cue declared by the playlist
 * @param {{start: number, end: number}} outletCue cue emitted by the outlet
 * @return {undefined} returns only when the two cues match
 */
const assertPlaylistMatches = function(playlistCue, outletCue) {
  if (playlistCue.start !== outletCue.start ||
      playlistCue.end !== outletCue.end) {
    throw new Error('Playlist cue (' + playlistCue.start + '/' + playlistCue.end +
      ') does not match outlet cue (' + outletCue.start + '/' +
      outletCue.end + ')');
  }
};

module.exports = {
  OUTLETS,
  CUE_TYPES,
  MODES,
  resolveMode,
  cueTimeToSeconds,
  cueToSeconds,
  normalizeCuePts,
  normalizedCueTimeToSeconds,
  normalizedCueToSeconds,
  assertPlaylistMatches
};
