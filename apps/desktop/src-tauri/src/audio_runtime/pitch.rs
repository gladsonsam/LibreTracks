use std::convert::TryInto;

use pitch_shift::{Shifter, TOTAL_F32};

const PITCH_BLOCK_FRAMES: usize = 128;

pub(crate) trait PitchShiftEngine: Send {
    fn process_interleaved(&mut self, input_interleaved: &[f32], finish: bool) -> Vec<f32>;
    fn reset(&mut self);
}

pub(crate) fn create_pitch_shift_engine(
    sample_rate: u32,
    channels: usize,
    transpose_semitones: i32,
) -> Box<dyn PitchShiftEngine> {
    if transpose_semitones == 0 {
        Box::new(BypassPitchShiftEngine)
    } else {
        Box::new(PhaseVocoderPitchShiftEngine::new(
            sample_rate,
            channels.max(1),
            transpose_semitones,
        ))
    }
}

struct BypassPitchShiftEngine;

impl PitchShiftEngine for BypassPitchShiftEngine {
    fn process_interleaved(&mut self, input_interleaved: &[f32], _finish: bool) -> Vec<f32> {
        input_interleaved.to_vec()
    }

    fn reset(&mut self) {}
}

struct PhaseVocoderPitchShiftEngine {
    sample_rate: u32,
    channels: usize,
    transpose_semitones: i32,
    shifters: Vec<Shifter<Box<[f32; TOTAL_F32]>>>,
    pending_samples: Vec<f32>,
}

impl PhaseVocoderPitchShiftEngine {
    fn new(sample_rate: u32, channels: usize, transpose_semitones: i32) -> Self {
        let shifters = (0..channels)
            .map(|_| {
                let state: Box<[f32; TOTAL_F32]> = vec![0.0; TOTAL_F32]
                    .into_boxed_slice()
                    .try_into()
                    .expect("pitch shifter state should have the expected size");
                Shifter::new(state)
            })
            .collect();

        Self {
            sample_rate,
            channels,
            transpose_semitones,
            shifters,
            pending_samples: Vec::new(),
        }
    }

    fn process_block(&mut self, block_interleaved: &[f32], output: &mut Vec<f32>) {
        let mut channel_input = [0.0_f32; PITCH_BLOCK_FRAMES];
        let mut channel_output = vec![0.0_f32; PITCH_BLOCK_FRAMES * self.channels];

        for channel in 0..self.channels {
            for frame in 0..PITCH_BLOCK_FRAMES {
                channel_input[frame] = block_interleaved[frame * self.channels + channel];
            }

            let shifted = self.shifters[channel].shift(
                &channel_input,
                self.transpose_semitones as f32,
                PITCH_BLOCK_FRAMES,
                self.sample_rate as f32,
            );

            for frame in 0..PITCH_BLOCK_FRAMES {
                channel_output[frame * self.channels + channel] = shifted[frame];
            }
        }

        output.extend_from_slice(&channel_output);
    }
}

impl PitchShiftEngine for PhaseVocoderPitchShiftEngine {
    fn process_interleaved(&mut self, input_interleaved: &[f32], finish: bool) -> Vec<f32> {
        if input_interleaved.is_empty() && !finish {
            return Vec::new();
        }

        self.pending_samples.extend_from_slice(input_interleaved);
        let block_samples = PITCH_BLOCK_FRAMES * self.channels;
        let mut output = Vec::new();

        while self.pending_samples.len() >= block_samples {
            let block = self.pending_samples[..block_samples].to_vec();
            self.pending_samples.drain(..block_samples);
            self.process_block(&block, &mut output);
        }

        if finish && !self.pending_samples.is_empty() {
            let mut block = self.pending_samples.split_off(0);
            block.resize(block_samples, 0.0);
            self.process_block(&block, &mut output);
        }

        output
    }

    fn reset(&mut self) {
        self.pending_samples.clear();
        self.shifters = (0..self.channels)
            .map(|_| {
                let state: Box<[f32; TOTAL_F32]> = vec![0.0; TOTAL_F32]
                    .into_boxed_slice()
                    .try_into()
                    .expect("pitch shifter state should have the expected size");
                Shifter::new(state)
            })
            .collect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bypass_engine_returns_input_unchanged() {
        let mut engine = create_pitch_shift_engine(48_000, 2, 0);
        let input = vec![0.25, -0.25, 0.5, -0.5];

        let output = engine.process_interleaved(&input, false);

        assert_eq!(output, input);
        engine.reset();
        assert!(engine.process_interleaved(&[], true).is_empty());
    }
}