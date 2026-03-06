use std::io::Write;
use std::time::Duration;

use super::DmxOutput;
use crate::EngineError;

/// ENTTEC DMX USB Pro widget protocol constants.
const START_BYTE: u8 = 0x7E;
const END_BYTE: u8 = 0xE7;
const SEND_DMX_LABEL: u8 = 0x06;
const DMX_START_CODE: u8 = 0x00;

/// Data length: 1 byte start code + 512 DMX channels = 513.
const DATA_LENGTH: u16 = 513;

/// Total packet size: 1 (start) + 1 (label) + 2 (length) + 513 (data) + 1 (end) = 518.
const PACKET_SIZE: usize = 518;

/// Serial baud rate for ENTTEC DMX USB Pro host-side communication.
/// The widget's FTDI chip defaults to 57600; the widget itself generates
/// the 250kbaud DMX signal on the XLR output.
const BAUD_RATE: u32 = 57_600;

/// Write timeout for the serial port.
const WRITE_TIMEOUT: Duration = Duration::from_millis(100);

/// ENTTEC DMX USB Pro output adapter.
///
/// Speaks the ENTTEC Pro widget protocol over a serial port.
/// Only sends universe 1 (single-universe device); other universes are silently ignored.
pub struct EnttecProOutput {
    port: Box<dyn serialport::SerialPort>,
}

impl EnttecProOutput {
    /// Open an ENTTEC DMX USB Pro on the given serial port path.
    pub fn new(port_name: &str) -> Result<Self, EngineError> {
        let port = serialport::new(port_name, BAUD_RATE)
            .timeout(WRITE_TIMEOUT)
            .open()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        Ok(Self { port })
    }

    /// Build a 518-byte ENTTEC Pro "Send DMX" packet on the stack.
    fn build_packet(data: &[u8; 512]) -> [u8; PACKET_SIZE] {
        let mut packet = [0u8; PACKET_SIZE];

        packet[0] = START_BYTE;
        packet[1] = SEND_DMX_LABEL;
        // Data length (little-endian): 513
        packet[2] = (DATA_LENGTH & 0xFF) as u8;
        packet[3] = (DATA_LENGTH >> 8) as u8;
        // DMX start code
        packet[4] = DMX_START_CODE;
        // 512 DMX channels
        packet[5..517].copy_from_slice(data);
        packet[517] = END_BYTE;

        packet
    }
}

impl DmxOutput for EnttecProOutput {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError> {
        if universe_id != 1 {
            return Ok(());
        }

        let packet = Self::build_packet(data);
        self.port.write_all(&packet)?;
        self.port.flush()?;
        Ok(())
    }

    fn label(&self) -> &str {
        "enttec-pro"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_size_is_518() {
        let packet = EnttecProOutput::build_packet(&[0u8; 512]);
        assert_eq!(packet.len(), PACKET_SIZE);
    }

    #[test]
    fn packet_start_byte() {
        let packet = EnttecProOutput::build_packet(&[0u8; 512]);
        assert_eq!(packet[0], START_BYTE);
    }

    #[test]
    fn packet_label_is_send_dmx() {
        let packet = EnttecProOutput::build_packet(&[0u8; 512]);
        assert_eq!(packet[1], SEND_DMX_LABEL);
    }

    #[test]
    fn packet_length_field_is_513_le() {
        let packet = EnttecProOutput::build_packet(&[0u8; 512]);
        let length = u16::from_le_bytes([packet[2], packet[3]]);
        assert_eq!(length, 513);
    }

    #[test]
    fn packet_end_byte() {
        let packet = EnttecProOutput::build_packet(&[0u8; 512]);
        assert_eq!(packet[517], END_BYTE);
    }

    #[test]
    fn packet_dmx_data_placement() {
        let mut data = [0u8; 512];
        data[0] = 255;
        data[100] = 128;
        data[511] = 42;

        let packet = EnttecProOutput::build_packet(&data);
        // Start code at offset 4
        assert_eq!(packet[4], DMX_START_CODE);
        // DMX data starts at offset 5
        assert_eq!(packet[5], 255);
        assert_eq!(packet[105], 128);
        assert_eq!(packet[516], 42);
    }
}
