import {
    MidiData,
    MidiEvent,
    MidiChannelEvent,
    MidiNoteMixins,
    MidiHeader,
} from 'midi-file'; // Make sure to import the correct types from the midi-file package

interface Opus {
    tpq: number,
    tracks: OpusEvent[][]
}

type OpusEvent = {} & MidiEvent

interface Score {
    tpq: number,
    tracks: ScoreEvent[][]
}

type ScoreMidiNoteEvent = MidiChannelEvent<"note"> & MidiNoteMixins

type ScoreEvent = {
    begin: number; // Event fires on this tick
} & (ScoreMidiNoteEvent | MidiEvent)

function rstrip(needle: string, haystack: string) {
    let regex = new RegExp(needle + "$");
    return haystack.replace(regex, "");
};

export class PianoConverter {
    private lineLengthLim: number;
    private linesLimit: number;
    private tickLag: number;
    private timeQuanta: number;
    private octaveTranspose: number;
    private floatPrecision: number;
    private octaveKeys: number;
    private highestOctave: number;
    private endOfLineChar: string;
    private overallImportLimit: number;
  
    constructor({
      lineLengthLim = 50,
      linesLimit = 200,
      tickLag = 0.5,
      octaveTranspose = 0,
      floatPrecision = 2,
      octaveKeys = 12,
      highestOctave = 8,
      endOfLineChar = '\n',
    }: {
      lineLengthLim?: number;
      linesLimit?: number;
      tickLag?: number;
      octaveTranspose?: number;
      floatPrecision?: number;
      octaveKeys?: number;
      highestOctave?: number;
      endOfLineChar?: string;
    }) {
      this.lineLengthLim = lineLengthLim;
      this.linesLimit = linesLimit;
      this.tickLag = tickLag;
      this.octaveTranspose = octaveTranspose;
      this.floatPrecision = floatPrecision;
      this.octaveKeys = octaveKeys;
      this.highestOctave = highestOctave;
      this.endOfLineChar = endOfLineChar;
      this.timeQuanta = 100 * this.tickLag
      this.overallImportLimit = 2 * this.lineLengthLim * this.linesLimit;
    }
  
    private updateTimeQuanta(): void {
      this.timeQuanta = 100 * this.tickLag;
    }
  
    private updateOverallLinesLimit(): void {
      this.overallImportLimit = 2 * this.lineLengthLim * this.linesLimit;
    }
  
    setLineLengthLim(lineLengthLim: number): void {
      this.lineLengthLim = lineLengthLim;
      this.updateOverallLinesLimit();
    }
  
    setLinesLimit(linesLimit: number): void {
      this.linesLimit = linesLimit;
      this.updateOverallLinesLimit();
    }
  
    setTickLag(tickLag: number): void {
      this.tickLag = tickLag;
      this.updateTimeQuanta();
    }

  // UTILITY FUNCTIONS
  private condition(event: ScoreEvent): boolean {
    if (event.type) {
        return event.type === "note";
    }
    return false;
  }

  private toMs(oldOpus: Opus | null = null): Opus {
    if (oldOpus === null) {
      return { tpq: 1000, tracks: [] };
    }
  
    const { tpq, tracks: oldTracks } = oldOpus;
    const newOpus: Opus = { tpq: 1000, tracks: [] };
    var millisecPerOldTick = 1000.0 / Math.round(tpq);
  
    for (const oldTrack of oldTracks) {
      let millisecSoFar = 0.0;
      let previousMillisecSoFar = 0.0;
      const newTrack: OpusEvent[] = [{ type: "setTempo", deltaTime: 0, microsecondsPerBeat: 1000000 }];
  
      for (const oldEvent of oldTrack) {
        const newEvent: OpusEvent = structuredClone(oldEvent);
        millisecSoFar += (millisecPerOldTick * oldEvent.deltaTime);
        newEvent.deltaTime = Math.round(millisecSoFar - previousMillisecSoFar);
  
        if (oldEvent.type === "setTempo") {
          millisecPerOldTick = oldEvent.microsecondsPerBeat / (1000.0 * tpq);
        } else {
          previousMillisecSoFar = millisecSoFar;
          newTrack.push(newEvent);
        }
      }
  
      newOpus.tracks.push(newTrack);
    }
  
    return newOpus;
  }
  
  private opus2score(opus: Opus): Score {
    if (opus.tracks.length < 2) {
      return {tpq: 1000, tracks: new Array<ScoreEvent[]>()};
    }
  
    const tracks: OpusEvent[][] = opus.tracks.map((track) => structuredClone(track));
    const ticks = opus.tpq;
    const score: Score = {tpq: ticks, tracks: new Array<ScoreEvent[]>()};
  
    for (const opusTrack of tracks) {
      let ticksSoFar = 0;
      const scoreTrack: ScoreEvent[] = [];
      const channelPitchToNoteOnEvents: Record<number, ScoreEvent[]> = {};
  
      for (const opusEvent of opusTrack) {
        ticksSoFar += opusEvent.deltaTime;
  
        if (opusEvent.type === "noteOff" || (opusEvent.type === "noteOn" && opusEvent.velocity === 0)) {
          const cha = opusEvent.channel;
          const pitch = opusEvent.noteNumber;
          const key = cha * 128 + pitch;
  
          if (channelPitchToNoteOnEvents[key]) {
            const newEvent = channelPitchToNoteOnEvents[key].shift()!;
            newEvent.deltaTime = ticksSoFar - newEvent.begin;
            scoreTrack.push(newEvent);
          }
        } else if (opusEvent.type === "noteOn") {
            const cha = opusEvent.channel;
            const pitch = opusEvent.noteNumber;
            const key = cha * 128 + pitch;
            const newEvent: ScoreEvent = {
                type: 'note',
                begin: ticksSoFar,
                deltaTime: 0,
                channel: cha,
                noteNumber: pitch,
                velocity: opusEvent.velocity
            };
    
            if (channelPitchToNoteOnEvents[key]) {
                channelPitchToNoteOnEvents[key].push(newEvent);
            } else {
                channelPitchToNoteOnEvents[key] = [newEvent];
            }
        } else {
          var newEvent: ScoreEvent = {
            ...opusEvent,
            begin: ticksSoFar
          }
          scoreTrack.push(newEvent);
        }
      }
  
      // Check for unterminated notes
      for (const channelPitch in channelPitchToNoteOnEvents) {
        const noteOnEvents = channelPitchToNoteOnEvents[channelPitch];
        for (const newEvent of noteOnEvents) {
          newEvent.deltaTime = ticksSoFar - newEvent.begin;
          scoreTrack.push(newEvent);
        }
      }
  
      score.tracks.push(scoreTrack);
    }
  
    return score;
  }

  private midi2opus(header: MidiHeader, tracks: MidiEvent[][]) {
    var opus: Opus = {tpq: 0, tracks: new Array()}
    //@ts-expect-error
    opus.tpq = header.ticksPerFrame ? header.ticksPerFrame * header.ticksPerBeat : header.ticksPerBeat ? header.ticksPerBeat : 160
    // Loop through the tracks and convert each event to opus format
    for (const track of structuredClone(tracks)) { 
      const opusTrack: OpusEvent[] = [];
  
      let prevTime = 0;
      for (const event of track) {
        // Calculate delta time (dtime) between the current event and the previous event
        var opusEvent: OpusEvent
  
        // Create a new opus event with the dtime and other event data
        opusEvent = {
            ...event
        }
  
        // Push the opus event to the track
        opusTrack.push(opusEvent);
      }
  
      // Add the track to the opus
      opus.tracks.push(opusTrack);
    }
    return opus;
  }

  private midi2scoreNoTick(header: MidiHeader, tracks: MidiEvent[][]) {
    var opus = this.midi2opus(header, tracks)
    opus = this.toMs(opus)
    var score = this.opus2score(opus)
    return score
  }

  private notenum2string(
    num: number,
    accidentals: boolean[],
    octaves: number[]
  ): [string, boolean[], number[]] {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const convertTable: { [key: number]: number } = { 1: 0, 3: 1, 6: 2, 8: 3, 10: 4 };
    const inclusionTable: { [key: number]: number } = { 0: 0, 2: 1, 5: 2, 7: 3, 9: 4 };
    const correspondenceTable: { [key: number]: number } = { 0: 1, 1: 0, 2: 3, 3: 2, 5: 6, 6: 5, 7: 8, 8: 7, 9: 10, 10: 9 };
  
    num += this.octaveKeys * this.octaveTranspose;
    const octave = Math.floor(num / this.octaveKeys);
    if (octave < 1 || octave > this.highestOctave) {
      return ['', [...accidentals], [...octaves]];
    }
  
    const outputAccidentals = [...accidentals];
    const outputOctaves = [...octaves];
    const nameIndex = num % this.octaveKeys;
  
    const accidental = names[nameIndex].length === 2;
    outputOctaves[nameIndex] = octave;
    if (correspondenceTable.hasOwnProperty(nameIndex)) {
      outputOctaves[correspondenceTable[nameIndex]] = octave;
    }
  
    let addN = false;
  
    if (accidental) {
      outputAccidentals[convertTable[nameIndex]] = true;
    } else {
      if (inclusionTable.hasOwnProperty(nameIndex)) {
        addN = accidentals[inclusionTable[nameIndex]];
        outputAccidentals[inclusionTable[nameIndex]] = false;
      }
    }
  
    return [
      `${names[nameIndex]}${addN ? 'n' : ''}${octave !== octaves[nameIndex] ? octave : ''}`,
      outputAccidentals,
      outputOctaves,
    ];
  }

  private durToMod(dur: number, bpm_mod: number = 1.0): string {
    const mod = bpm_mod / dur;
    const roundedMod = mod.toFixed(this.floatPrecision);
    return roundedMod.replace(/0+$/, '').replace(/\.$/, '');
  }
  // END OF UTILITY FUNCTIONS

  // CONVERSION FUNCTIONS
  private filterEventsFromScore(score: Score): Score {
    var newTracks: ScoreEvent[][] = []
    var newScore: Score = {tpq: score.tpq, tracks: newTracks}
    for (const track of score.tracks) {
        var newTrack: ScoreEvent[] = []
        for(const note of track) {
            if (this.condition(note)) {
                newTrack.push(note)
            }
        }
        newTracks.push(newTrack)
    }
    newScore.tracks = newTracks
    return newScore
  }

  private filterEmptyTracks(score: Score): Score {
    return {...score, tracks: score.tracks.filter((scoreTrack) => {return scoreTrack.length > 0})};
  }

  private mergeEvents(score: Score): Score {
    return {...score, tracks: [score.tracks.reduce((merged, track) => merged.concat(track), [])]};
  }

  private sortScoreByEventTimes(score: Score): Score {
    return {...score, tracks: score.tracks.map((track) => {return track.slice().sort((a, b) => a.begin - b.begin)})};
  }

  private convertIntoSecondsPerTicks(score: Score): Score {
    const newTracks: ScoreEvent[][] = [];
    const { tpq, tracks } = score;
  
    for (const track of tracks) {
      const newTrack: ScoreEvent[] = [];
  
      for (let i = 0; i < track.length - 1; i++) {
        const currentEvent = track[i];
        const nextEvent = track[i + 1];
        const deltaTime = nextEvent.begin - currentEvent.begin;
        const newEvent: ScoreEvent = { ...currentEvent, deltaTime };
        newTrack.push(newEvent);
      }
  
      // Add the last event with a 1000ms duration as a final note
      const lastEvent = track[track.length - 1];
      const newLastEvent: ScoreEvent = { ...lastEvent, deltaTime: 1000 };
      newTrack.push(newLastEvent);
  
      newTracks.push(newTrack);
    }
  
    return { tpq, tracks: newTracks };
  }

  private performRoundation(score: Score): number[][] {
    return score.tracks[0].map((event) => {
        var noteEvent = event as ScoreEvent & ScoreMidiNoteEvent
        const roundedDelta = Math.round(noteEvent.deltaTime / this.timeQuanta) * this.timeQuanta;
        return [roundedDelta, noteEvent.noteNumber];
    });
  }
  

  private obtainCommonDuration(score: number[][]): number {
    const durations = score.map((event) => event[0]).filter((dur) => dur !== 0);
    const uniqueDurations = Array.from(new Set(durations));
    const durationsCount = uniqueDurations.map((dur) => durations.filter((d) => d === dur).length);
    const highestCount = Math.max(...durationsCount);
    const mostFrequentDuration = uniqueDurations[durationsCount.indexOf(highestCount)];
    return mostFrequentDuration;
  }

  private reduceScoreToChords(score: number[][]): [number[], number][] {
    const newScore: [number[], number][] = [];
    let newChord: [number[], number] = [[], 0];
  
    for (const event of score) {
      newChord[0].push(event[1]); // Append new note to the chord
  
      if (event[0] === 0) {
        continue; // Add new notes to the chord until non-zero duration is hit
      }
  
      newChord[1] = event[0]; // This is the duration of the chord
      newScore.push([newChord[0].slice(), newChord[1]]); // Append cloned chord to the list
      newChord = [[], 0]; // Reset the chord
    }
  
    return newScore;
  }

  private obtainSheetMusic(score: [number[], number][], mostFrequentDur: number): string {
    let sheetMusic = "";
    let octaves = Array(12).fill(3);
    let accidentals = Array(7).fill(false);
  
    for (const event of score) {
      for (let noteIndex = 0; noteIndex < event[0].length; noteIndex++) {
        const data = this.notenum2string(event[0][noteIndex], accidentals, octaves);
        sheetMusic += data[0];
        accidentals = data[1];
        octaves = data[2];
  
        if (noteIndex !== event[0].length - 1) {
          sheetMusic += "-";
        }
      }
  
      if (event[1] !== mostFrequentDur) {
        sheetMusic += "/";
        sheetMusic += this.durToMod(event[1], mostFrequentDur);
      }
  
      sheetMusic += ",";
    }
  
    return sheetMusic;
  }

  private explodeSheetMusic(sheetMusic: string): string[] {
    const splitMusic = sheetMusic.split(',');
    const splitList: string[] = [];
    let counter = 0;
    let lineCounter = 1;
  
    for (const note of splitMusic) {
      if (lineCounter > (this.linesLimit - 1)) {
        break;
      }
  
      if ((counter + note.length) > (this.lineLengthLim - 2)) {
        splitList[splitList.length - 1] = rstrip(',', splitList[splitList.length - 1]);
        splitList[splitList.length - 1] += this.endOfLineChar;
        counter = 0;
        lineCounter += 1;
      }
  
      splitList.push(note + ',');
      counter += note.length;
    }
  
    return splitList;
  }
  
  private finalizeSheetMusic(splitMusic: string[], mostFrequentDur: number): string {
    let sheetMusic = ""
    for (const notes of splitMusic) {
        sheetMusic += notes
    }

    sheetMusic = "BPM: " + Math.floor(60000 / mostFrequentDur) + this.endOfLineChar + sheetMusic;
    sheetMusic = sheetMusic.trim();
    sheetMusic = rstrip(',', rstrip(',', sheetMusic));
    return sheetMusic.substring(0, Math.min(sheetMusic.length, this.overallImportLimit));
  }

  public async toPiano(midi: MidiData): Promise<string> {
    var score: Score | Opus;
    score = this.midi2scoreNoTick(midi.header, midi.tracks);

    score = this.filterEventsFromScore(score);
    var filteredScore = this.filterEmptyTracks(score);
    score = this.mergeEvents(filteredScore);
    score = this.sortScoreByEventTimes(score);
    score = this.convertIntoSecondsPerTicks(score);

    // Stops being a real 'Score' object here, now we're just working with arrays of numbers.
    const roundedScore = this.performRoundation(score);
    const mostFrequentDur = this.obtainCommonDuration(roundedScore);
    const reducedScore = this.reduceScoreToChords(roundedScore);

    // Strings and arrays of strings from here on out.
    const sheetMusic = this.obtainSheetMusic(reducedScore, mostFrequentDur);
    const splitMusic = this.explodeSheetMusic(sheetMusic);

    const finalSheetMusic = this.finalizeSheetMusic(splitMusic, mostFrequentDur);
    return finalSheetMusic;
  }
}