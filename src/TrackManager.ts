import { parseMidi, MidiData } from "midi-file"
import { programName, programGroup } from "./helpers/midi"
import { PianoConverter } from "./PianoConverter"

const PERCUSSIVE_PROGRAMS = [112, 113, 114, 115, 116, 117, 118]
const SOUND_EFFECT_PROGRAMS = [119, 120, 121, 122, 123, 124, 125, 126, 127]
const DEFAULT_IGNORED_PROGRAMS = [...PERCUSSIVE_PROGRAMS, ...SOUND_EFFECT_PROGRAMS]

class Track {
    title: string = ""
    instruments: Set<number> = new Set()
    instrumentStrings: Set<string> = new Set()
    instrumentGroups: Set<string> = new Set()
    noteCount: number = 0
    channels: Set<number> = new Set()
    track: number = -1
    index: number = -1
    percussionChannels: Set<number> = new Set()

    // Things that will effect the end results of conversion
    disabled: boolean = false
    transpose: number = 0 //TODO

    toString() {
        var instrumentStringsArray = Array.from(this.instrumentStrings)
        var instrumentGroupsArray = Array.from(this.instrumentGroups)
        var disabled = this.disabled ? "[X]" : null
        var track = `~${this.track}~`
        var title = this.title ? `${this.title}:` : null
        var instruments = `[${instrumentStringsArray.join(", ")}]`
        var groups = `<${instrumentGroupsArray.join(", ")}>`
        var noteCount = `Notes: ${this.noteCount}`

        return [disabled, track, title, instruments, groups, noteCount, disabled].join(" ").trim()
    }
}

export class TrackManager {
    midiBuffer?: Buffer
    midiObject?: MidiData
    modifiedMidiObject?: MidiData

    lineLimit: number
    lineLengthLimit: number
    tickLag: number
    endOfLine: string

    octaveTranspose: number
    floatPrecision: number

    octaveKeys: number
    highestOctave: number

    identifiedTracks: Track[]

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
        this.lineLimit = linesLimit
        this.lineLengthLimit = lineLengthLim
        this.tickLag = tickLag
        this.endOfLine = endOfLineChar
        this.octaveTranspose = octaveTranspose
        this.floatPrecision = floatPrecision
        this.octaveKeys = octaveKeys
        this.highestOctave = highestOctave
        
        this.identifiedTracks = new Array<Track>()
    }

    setMidi(midi: Buffer) {
        this.resetMidi()
        this.identifiedTracks = new Array<Track>()
        this.midiBuffer = midi
        this.process()
    }

    toggleTracks(tracks: number[]) {
        if (!this.identifiedTracks) {
            throw("There is no midi loaded, or the midi has no valid tracks.")
        }
        var selectedTracks = this.identifiedTracks.filter((x) => { return tracks.includes(x.track) })
        for (var track of selectedTracks) {
            track.disabled = !track.disabled
        }
        this.modifyMidi()
    }

    toggleTrack(track: number) {
        if (!this.identifiedTracks) {
            throw("There is no midi loaded, or the midi has no valid tracks.")
        }
        var selectedTrack = this.identifiedTracks.find((x) => { return x.track == track })
        if (selectedTrack) selectedTrack.disabled = !selectedTrack.disabled
        this.modifyMidi()
    }

    disableTrack(track: number) {
        if (!this.identifiedTracks) {
            throw("There is no midi loaded, or the midi has no valid tracks.")
        }
        var selectedTrack = this.identifiedTracks.find((x) => { return x.track == track })
        if (selectedTrack) selectedTrack.disabled = true
        this.modifyMidi()
    }

    enableTrack(track: number) {
        if (!this.identifiedTracks) {
            throw("There is no midi loaded, or the midi has no valid tracks.")
        }
        var selectedTrack = this.identifiedTracks.find((x) => { return x.track == track })
        if (selectedTrack) selectedTrack.disabled = false
        this.modifyMidi()
    }

    disableAllTracks() {
        for(var track of this.identifiedTracks) {
            track.disabled = true
        }
        this.modifyMidi()
    }

    enableAllTracks() {
        for(var track of this.identifiedTracks) {
            track.disabled = false
        }
        this.modifyMidi()
    }

    private modifyMidi() {
        if(!this.midiObject) {
            throw("You cannot modify nothing, please provide a midi with setMidi(midi).")
        }

        var tempMidiObject = structuredClone(this.midiObject)
        tempMidiObject.tracks.length = 0

        var disabledTrackIndexes = new Set(this.identifiedTracks.filter((x) => { return x.disabled })
                                                        .map((x) => { return x.index }))

        var idx = 0
        for (const track of this.midiObject.tracks) {
            if (!disabledTrackIndexes.has(idx)) {
                tempMidiObject.tracks.push(track)
                //TODO: Track-level transposing
            }
            idx++
        }

        this.modifiedMidiObject = tempMidiObject
    }

    async toPiano() {
        if (!this.midiObject) {
            throw("There's nothing to convert, please provide a midi with setMidi(midi).")
        }
        var disabledTrackIndexes = new Set(this.identifiedTracks.filter((x) => { return x.disabled })
                                                        .map((x) => { return x.index }))

        if (disabledTrackIndexes.size >= this.identifiedTracks.length) {
            throw("At least one track must be enabled.")
        }

        var targetedMidi = this.modifiedMidiObject ? this.modifiedMidiObject : this.midiObject

        var piano = new PianoConverter({
            lineLengthLim: this.lineLengthLimit,
            linesLimit: this.lineLimit,
            tickLag: this.tickLag,
            octaveTranspose: this.octaveTranspose,
            floatPrecision: this.floatPrecision,
            octaveKeys: this.octaveKeys,
            highestOctave: this.highestOctave,
            endOfLineChar: this.endOfLine
        })
        return await piano.toPiano(targetedMidi)
    }

    private resetMidi() {
        this.modifiedMidiObject = undefined
    }

    private process() {
        if(!this.midiBuffer) {
            throw("You cannot convert nothing, please provide a midi with setMidi(midi).")
        }

        this.midiObject = parseMidi(this.midiBuffer)
        
        var currentTrack = 0
        var mustModify = false
        for (const track of this.midiObject.tracks) {
            var pendingTrack = new Track()
            pendingTrack.track = currentTrack

            var hasNotes = false
            for (const event of track) {
                switch(event.type) {
                    case "trackName":
                        pendingTrack.title = event.text.trim()
                        break
                    case "noteOn":
                        hasNotes = true
                        pendingTrack.channels.add(event.channel)
                        if (event.channel == 9) {
                            pendingTrack.percussionChannels.add(event.channel)
                        }
                        pendingTrack.noteCount++
                        break
                    case "programChange":
                        hasNotes = true
                        pendingTrack.instruments.add(event.programNumber)
                        pendingTrack.channels.add(event.channel)
                        if (DEFAULT_IGNORED_PROGRAMS.includes(event.programNumber)) {
                            pendingTrack.percussionChannels.add(event.channel)
                        }
                        if (event.channel == 9) {
                            pendingTrack.percussionChannels.add(event.channel)
                        }
                        break
                }
            }

            if (hasNotes && pendingTrack.instruments.size == 0) {
                pendingTrack.instruments.add(0)
                pendingTrack.instrumentStrings.add(programName(0))
            }

            if (pendingTrack.instruments.size > 0) {
                pendingTrack.index = this.identifiedTracks.length
                this.identifiedTracks.push(pendingTrack)
            }

            if (pendingTrack.percussionChannels.size > 0) {
                pendingTrack.disabled = true
                mustModify = true
            }

            for (const instrument of pendingTrack.instruments) {
                if (pendingTrack.instruments.size == 1 && pendingTrack.channels.has(9)) {
                    pendingTrack.instrumentGroups.add("Percussion")
                    pendingTrack.instrumentStrings.add("Percussion")
                    if (pendingTrack.instrumentStrings.has("Acoustic Grand Piano")) {
                        pendingTrack.instrumentStrings.delete("Acoustic Grand Piano")
                    }
                } else {
                    pendingTrack.instrumentGroups.add(programGroup(instrument))
                    pendingTrack.instrumentStrings.add(programName(instrument))
                }
            }

            currentTrack++
        }

        if (mustModify) {
            this.modifyMidi()
        }
    }
}
