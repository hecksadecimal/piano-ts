# Usage

```ts
import { TrackManager } from "piano-ts";

// ...

var file: File // Get a standard File Object.

const TICK_LAG = 0.5
const LINES_LIMIT = 200

const bytes = await file.arrayBuffer()
const buffer = Buffer.from(bytes)

/* Available options and their defaults:
*  lineLengthLim = 50,
*  linesLimit = 200,
*  tickLag = 0.5,
*  octaveTranspose = 0,
*  floatPrecision = 2,
*  octaveKeys = 12,
*  highestOctave = 8,
*  endOfLineChar = '\n',
*/
let trackManager = new TrackManager({tickLag: TICK_LAG, linesLimit: LINES_LIMIT})
trackManager.setMidi(buffer)
let pianoData = await trackManager.toPiano()

// Another conversion with a different ticklag.
trackManager.tickLag = 0.6
pianoData = await trackManager.toPiano()

// Exclude a specific track from the end result.
trackManager.disableTrack(1)
pianoData = await trackManager.toPiano()

// trackManager.identifiedTracks will contain a list of valid tracks.
// Anything with percussion will automatically be disabled when the midi is set.
// See Track typedef for information a track contains for display purposes.
```