'use strict';

const
  QUnit = require('qunit');
const timing = require('../lib/utils/outlet-timing');
const OUTLETS = timing.OUTLETS;
const CUE_TYPES = timing.CUE_TYPES;
const MODES = timing.MODES;

QUnit.module('Outlet Timing');

// A live segment starting at 90000 (one second in on the 90kHz clock). The
// subtitle is drawn from 180000 to 270000 and the song title is punched with
// the same pts range.
const SEGMENT_START_PTS = 90000;
const CUE = { startPts: 180000, endPts: 270000 };
const KEEP_CUE = { start: 2, end: 3 };
const ALIGN_CUE = { start: 1, end: 2 };

const ALL_OUTLETS = [
  OUTLETS.VOD,
  OUTLETS.PLAYBACK,
  OUTLETS.LOW_LATENCY
];
const ALL_CUE_TYPES = [CUE_TYPES.SUBTITLE, CUE_TYPES.SONG_TITLE];

QUnit.test(
  'keep original timestamps gives start 2 end 3 on every outlet',
  function(assert) {
    ALL_OUTLETS.forEach(function(outlet) {
      ALL_CUE_TYPES.forEach(function(cueType) {
        assert.deepEqual(
          timing.cueToSeconds(
            CUE, SEGMENT_START_PTS, outlet, cueType,
            MODES.KEEP_ORIGINAL_TIMESTAMPS
          ),
          KEEP_CUE,
          outlet + ' ' + cueType + ' keeps the original timestamps'
        );
      });
    });

    // The two specific bugs being reported.
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE,
        MODES.KEEP_ORIGINAL_TIMESTAMPS
      ),
      KEEP_CUE,
      'playback subtitle start must be 2, not 1, when keeping originals'
    );
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SONG_TITLE,
        MODES.KEEP_ORIGINAL_TIMESTAMPS
      ),
      KEEP_CUE,
      'low latency song title keeps start 2 end 3'
    );
  }
);

QUnit.test(
  'align to segment gives start 1 end 2 on every outlet',
  function(assert) {
    ALL_OUTLETS.forEach(function(outlet) {
      ALL_CUE_TYPES.forEach(function(cueType) {
        assert.deepEqual(
          timing.cueToSeconds(
            CUE, SEGMENT_START_PTS, outlet, cueType,
            MODES.ALIGN_TO_SEGMENT
          ),
          ALIGN_CUE,
          outlet + ' ' + cueType + ' aligns to the segment'
        );
      });
    });

    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SONG_TITLE,
        MODES.ALIGN_TO_SEGMENT
      ),
      ALIGN_CUE,
      'low latency song title start must be 1, not 2, when aligned'
    );
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE,
        MODES.ALIGN_TO_SEGMENT
      ),
      ALIGN_CUE,
      'playback subtitle aligns to start 1 end 2'
    );
  }
);

QUnit.test(
  'playback seconds equal low latency song title seconds for a request',
  function(assert) {
    [MODES.KEEP_ORIGINAL_TIMESTAMPS, MODES.ALIGN_TO_SEGMENT]
      .forEach(function(mode) {
        const playback = timing.cueToSeconds(CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE, mode);
        const lowLatencyTitle = timing.cueToSeconds(
          CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY,
          CUE_TYPES.SONG_TITLE, mode
        );

        assert.deepEqual(
          playback,
          lowLatencyTitle,
          'both outlets emit the same seconds for ' + mode
        );
      });
  }
);

QUnit.test(
  'the two implementation approaches land on the same numbers',
  function(assert) {
    ALL_OUTLETS.forEach(function(outlet) {
      ALL_CUE_TYPES.forEach(function(cueType) {
        [
          MODES.KEEP_ORIGINAL_TIMESTAMPS,
          MODES.ALIGN_TO_SEGMENT,
          undefined
        ].forEach(function(request) {
          assert.deepEqual(
            timing.cueToSeconds(CUE, SEGMENT_START_PTS, outlet, cueType, request),
            timing.normalizedCueToSeconds(CUE, SEGMENT_START_PTS, outlet, cueType, request),
            outlet + ' ' + cueType + ' ' + request
          );
        });
      });
    });
  }
);

QUnit.test(
  'without a request the legacy behavior is unchanged',
  function(assert) {
  // Playback has no mode distinction: it stays aligned. Flipping it to 2
  // without a request is a rejected version.
    assert.deepEqual(
      timing.cueToSeconds(CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE),
      ALIGN_CUE,
      'unrequested playback subtitle stays start 1 end 2'
    );

    // The low latency song title always kept the original timestamps.
    assert.deepEqual(
      timing.cueToSeconds(CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SONG_TITLE),
      KEEP_CUE,
      'unrequested low latency song title stays start 2 end 3'
    );

    // Low latency subtitles continue to follow the request they receive.
    assert.deepEqual(
      timing.cueToSeconds(CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SUBTITLE),
      ALIGN_CUE,
      'unrequested low latency subtitle aligns'
    );
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SUBTITLE,
        MODES.KEEP_ORIGINAL_TIMESTAMPS
      ),
      KEEP_CUE,
      'requested low latency subtitle keeps originals'
    );
  }
);

QUnit.test('vod keeps both sets of numbers', function(assert) {
  assert.deepEqual(
    timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.VOD, CUE_TYPES.SUBTITLE,
      MODES.KEEP_ORIGINAL_TIMESTAMPS
    ),
    KEEP_CUE,
    'vod keeps start 2 end 3'
  );
  assert.deepEqual(
    timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.VOD, CUE_TYPES.SUBTITLE,
      MODES.ALIGN_TO_SEGMENT
    ),
    ALIGN_CUE,
    'vod aligns to start 1 end 2'
  );
  assert.deepEqual(
    timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.VOD, CUE_TYPES.SONG_TITLE,
      MODES.KEEP_ORIGINAL_TIMESTAMPS
    ),
    KEEP_CUE,
    'vod song title keeps start 2 end 3'
  );
});

QUnit.test('a zero segment start is 2/3 in both modes', function(assert) {
  ALL_OUTLETS.forEach(function(outlet) {
    ALL_CUE_TYPES.forEach(function(cueType) {
      assert.deepEqual(
        timing.cueToSeconds(CUE, 0, outlet, cueType, MODES.KEEP_ORIGINAL_TIMESTAMPS),
        KEEP_CUE,
        'keep originals with zero segment start'
      );
      assert.deepEqual(
        timing.cueToSeconds(CUE, 0, outlet, cueType, MODES.ALIGN_TO_SEGMENT),
        KEEP_CUE,
        'aligned with zero segment start is not collapsed to 1'
      );
    });
  });
});

QUnit.test(
  'applying the rule a second time does not change the answer',
  function(assert) {
    const first = timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE,
      MODES.KEEP_ORIGINAL_TIMESTAMPS
    );

    assert.deepEqual(first, KEEP_CUE, 'first pass is 2/3');
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE,
        MODES.KEEP_ORIGINAL_TIMESTAMPS
      ),
      first,
      'second pass keeps playback subtitle at 2, not 1'
    );

    const alignedTitle = timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SONG_TITLE,
      MODES.ALIGN_TO_SEGMENT
    );

    assert.deepEqual(alignedTitle, ALIGN_CUE, 'first alignment is 1/2');
    assert.deepEqual(
      timing.cueToSeconds(
        CUE, SEGMENT_START_PTS, OUTLETS.LOW_LATENCY, CUE_TYPES.SONG_TITLE,
        MODES.ALIGN_TO_SEGMENT
      ),
      alignedTitle,
      'second alignment keeps the low latency song title at 1, not 2'
    );
  }
);

QUnit.test(
  'playlist and outlet must agree in both directions',
  function(assert) {
    const outletCue = timing.cueToSeconds(
      CUE, SEGMENT_START_PTS, OUTLETS.PLAYBACK, CUE_TYPES.SUBTITLE,
      MODES.KEEP_ORIGINAL_TIMESTAMPS
    );

    assert.ok(
      timing.assertPlaylistMatches(KEEP_CUE, outletCue) === undefined,
      'matching playlist and outlet pass'
    );

    assert.throws(function() {
    // Playlist says 2, outlet still emits 1.
      timing.assertPlaylistMatches(KEEP_CUE, ALIGN_CUE);
    }, 'playlist 2 with outlet 1 is rejected');

    assert.throws(function() {
    // Outlet emits 2, playlist still says 1.
      timing.assertPlaylistMatches(ALIGN_CUE, KEEP_CUE);
    }, 'playlist 1 with outlet 2 is rejected');
  }
);

QUnit.test('unknown outlet or cue type is rejected', function(assert) {
  assert.throws(function() {
    timing.cueTimeToSeconds(CUE.startPts, SEGMENT_START_PTS, 'webcast', CUE_TYPES.SUBTITLE);
  }, 'unknown outlet throws');
  assert.throws(function() {
    timing.cueTimeToSeconds(CUE.startPts, SEGMENT_START_PTS, OUTLETS.VOD, 'commercial');
  }, 'unknown cue type throws');
});
