use std::collections::HashMap;
use std::net::UdpSocket;

use super::DmxOutput;
use crate::EngineError;

/// E1.31 (sACN) multicast port.
const SACN_PORT: u16 = 5568;

/// Total E1.31 packet size: 126-byte header + 512 DMX channels.
const PACKET_SIZE: usize = 638;

/// ACN packet identifier (12 bytes).
const ACN_PACKET_ID: [u8; 12] = [
    0x41, 0x53, 0x43, 0x2D, 0x45, 0x31, 0x2E, 0x31, 0x37, 0x00, 0x00, 0x00,
];

/// sACN E1.31 output adapter.
///
/// Sends DMX universes as UDP multicast packets to `239.255.0.{universe}:5568`.
pub struct SacnOutput {
    socket: UdpSocket,
    cid: [u8; 16],
    source_name: [u8; 64],
    sequence: HashMap<u16, u8>,
    priority: u8,
}

impl SacnOutput {
    pub fn new(priority: u8) -> Result<Self, EngineError> {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        let cid = *uuid::Uuid::new_v4().as_bytes();

        let mut source_name = [0u8; 64];
        let name = b"DreamLightConsole";
        source_name[..name.len()].copy_from_slice(name);

        Ok(Self {
            socket,
            cid,
            source_name,
            sequence: HashMap::new(),
            priority,
        })
    }

    /// Build a complete 638-byte E1.31 packet.
    fn build_packet(
        &self,
        universe_id: u16,
        sequence: u8,
        data: &[u8; 512],
    ) -> [u8; PACKET_SIZE] {
        let mut pkt = [0u8; PACKET_SIZE];

        // ── Root Layer (offset 0) ────────────────────────────────────────
        // Preamble size (u16 BE)
        pkt[0] = 0x00;
        pkt[1] = 0x10;
        // Post-amble size (u16 BE)
        pkt[2] = 0x00;
        pkt[3] = 0x00;
        // ACN packet identifier (12 bytes)
        pkt[4..16].copy_from_slice(&ACN_PACKET_ID);
        // Flags (0x7) + length of remaining root layer data (638 - 16 = 622)
        let root_len: u16 = (PACKET_SIZE - 16) as u16;
        pkt[16] = 0x70 | ((root_len >> 8) as u8 & 0x0F);
        pkt[17] = root_len as u8;
        // Root vector: 0x00000004 (E1.31 data packet)
        pkt[18] = 0x00;
        pkt[19] = 0x00;
        pkt[20] = 0x00;
        pkt[21] = 0x04;
        // CID (16 bytes)
        pkt[22..38].copy_from_slice(&self.cid);

        // ── Framing Layer (offset 38) ────────────────────────────────────
        // Flags (0x7) + length of remaining framing layer (638 - 38 = 600)
        let framing_len: u16 = (PACKET_SIZE - 38) as u16;
        pkt[38] = 0x70 | ((framing_len >> 8) as u8 & 0x0F);
        pkt[39] = framing_len as u8;
        // Framing vector: 0x00000002
        pkt[40] = 0x00;
        pkt[41] = 0x00;
        pkt[42] = 0x00;
        pkt[43] = 0x02;
        // Source name (64 bytes, UTF-8 null-padded)
        pkt[44..108].copy_from_slice(&self.source_name);
        // Priority
        pkt[108] = self.priority;
        // Synchronization address (u16 BE) = 0
        pkt[109] = 0x00;
        pkt[110] = 0x00;
        // Sequence number
        pkt[111] = sequence;
        // Options
        pkt[112] = 0x00;
        // Universe number (u16 BE)
        pkt[113] = (universe_id >> 8) as u8;
        pkt[114] = universe_id as u8;

        // ── DMP Layer (offset 115) ───────────────────────────────────────
        // Flags (0x7) + length of remaining DMP layer (638 - 115 = 523)
        let dmp_len: u16 = (PACKET_SIZE - 115) as u16;
        pkt[115] = 0x70 | ((dmp_len >> 8) as u8 & 0x0F);
        pkt[116] = dmp_len as u8;
        // DMP vector: 0x02 (set property)
        pkt[117] = 0x02;
        // Address type & data type: 0xA1
        pkt[118] = 0xA1;
        // First property address (u16 BE) = 0
        pkt[119] = 0x00;
        pkt[120] = 0x00;
        // Address increment (u16 BE) = 1
        pkt[121] = 0x00;
        pkt[122] = 0x01;
        // Property value count (u16 BE) = 513 (start code + 512 channels)
        pkt[123] = 0x02;
        pkt[124] = 0x01;
        // DMX start code
        pkt[125] = 0x00;
        // DMX channel data (512 bytes)
        pkt[126..PACKET_SIZE].copy_from_slice(data);

        pkt
    }
}

impl DmxOutput for SacnOutput {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError> {
        let seq = *self.sequence.entry(universe_id).or_insert(0);
        let packet = self.build_packet(universe_id, seq, data);
        self.sequence.insert(universe_id, seq.wrapping_add(1));

        let high = ((universe_id >> 8) & 0xFF) as u8;
        let low = (universe_id & 0xFF) as u8;
        let addr = format!("239.255.{high}.{low}:{SACN_PORT}");
        self.socket.send_to(&packet, &addr)?;

        Ok(())
    }

    fn label(&self) -> &str {
        "sacn"
    }
}

/// Build an E1.31 packet with explicit parameters (for testing without a socket).
#[cfg(test)]
fn build_test_packet(
    cid: &[u8; 16],
    source_name: &[u8; 64],
    priority: u8,
    universe_id: u16,
    sequence: u8,
    data: &[u8; 512],
) -> [u8; PACKET_SIZE] {
    let output = SacnOutput {
        // SAFETY: we only call build_packet, never send_to. The socket is unused.
        socket: UdpSocket::bind("0.0.0.0:0").unwrap(),
        cid: *cid,
        source_name: *source_name,
        sequence: HashMap::new(),
        priority,
    };
    output.build_packet(universe_id, sequence, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_cid() -> [u8; 16] {
        [
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,
            0x0F, 0x10,
        ]
    }

    fn test_source_name() -> [u8; 64] {
        let mut name = [0u8; 64];
        name[..17].copy_from_slice(b"DreamLightConsole");
        name
    }

    #[test]
    fn sacn_packet_size_is_638() {
        let data = [0u8; 512];
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 1, 0, &data);
        assert_eq!(pkt.len(), 638);
    }

    #[test]
    fn sacn_preamble_and_acn_id() {
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 1, 0, &[0u8; 512]);
        // Preamble
        assert_eq!(&pkt[0..2], &[0x00, 0x10]);
        // Post-amble
        assert_eq!(&pkt[2..4], &[0x00, 0x00]);
        // ACN packet identifier
        assert_eq!(&pkt[4..16], &ACN_PACKET_ID);
    }

    #[test]
    fn sacn_root_layer_vector_and_flags() {
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 1, 0, &[0u8; 512]);
        // Root flags+length: 0x7000 | 622 = 0x726E
        assert_eq!(pkt[16], 0x72);
        assert_eq!(pkt[17], 0x6E);
        // Root vector: 0x00000004
        assert_eq!(&pkt[18..22], &[0x00, 0x00, 0x00, 0x04]);
    }

    #[test]
    fn sacn_cid_is_embedded() {
        let cid = test_cid();
        let pkt = build_test_packet(&cid, &test_source_name(), 100, 1, 0, &[0u8; 512]);
        assert_eq!(&pkt[22..38], &cid);
    }

    #[test]
    fn sacn_framing_layer() {
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 1, 0, &[0u8; 512]);
        // Framing flags+length: 0x7000 | 600 = 0x7258
        assert_eq!(pkt[38], 0x72);
        assert_eq!(pkt[39], 0x58);
        // Framing vector: 0x00000002
        assert_eq!(&pkt[40..44], &[0x00, 0x00, 0x00, 0x02]);
        // Source name starts at 44
        assert_eq!(&pkt[44..61], b"DreamLightConsole");
        // Priority
        assert_eq!(pkt[108], 100);
        // Sequence
        assert_eq!(pkt[111], 0);
    }

    #[test]
    fn sacn_universe_number() {
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 7, 0, &[0u8; 512]);
        // Universe (u16 BE) at offset 113-114
        assert_eq!(pkt[113], 0x00);
        assert_eq!(pkt[114], 0x07);
    }

    #[test]
    fn sacn_dmp_layer_and_dmx_data() {
        let mut data = [0u8; 512];
        data[0] = 255;
        data[511] = 128;
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 100, 1, 0, &data);

        // DMP flags+length: 0x7000 | 523 = 0x720B
        assert_eq!(pkt[115], 0x72);
        assert_eq!(pkt[116], 0x0B);
        // DMP vector
        assert_eq!(pkt[117], 0x02);
        // Address type
        assert_eq!(pkt[118], 0xA1);
        // Start code
        assert_eq!(pkt[125], 0x00);
        // DMX data
        assert_eq!(pkt[126], 255);
        assert_eq!(pkt[637], 128);
    }

    #[test]
    fn sacn_sequence_wraps() {
        let mut output = SacnOutput::new(100).unwrap();
        // Manually set sequence near wrap point
        output.sequence.insert(1, 254);

        let mut data = [0u8; 512];
        data[0] = 1;
        // Sequence 254
        let pkt = output.build_packet(1, 254, &data);
        assert_eq!(pkt[111], 254);

        // Simulate two sends to verify wrapping via send_universe
        // After the insert of 254, first send uses 254 and increments to 255
        output.sequence.insert(1, 255);
        // Use a loopback-bound socket so send doesn't fail
        let _ = output.send_universe(1, &data);
        assert_eq!(*output.sequence.get(&1).unwrap(), 0);
    }

    #[test]
    fn sacn_priority_is_configurable() {
        let pkt = build_test_packet(&test_cid(), &test_source_name(), 200, 1, 0, &[0u8; 512]);
        assert_eq!(pkt[108], 200);
    }

    #[test]
    fn sacn_implements_send() {
        fn assert_send<T: Send>() {}
        assert_send::<SacnOutput>();
    }

    #[test]
    fn sacn_label() {
        let output = SacnOutput::new(100).unwrap();
        assert_eq!(output.label(), "sacn");
    }

    #[test]
    #[ignore] // Requires network — run manually
    fn sacn_integration_send_and_receive() {
        use std::net::Ipv4Addr;
        use std::time::Duration;

        let recv_socket = UdpSocket::bind(format!("0.0.0.0:{SACN_PORT}")).unwrap();
        recv_socket
            .join_multicast_v4(&Ipv4Addr::new(239, 255, 0, 1), &Ipv4Addr::UNSPECIFIED)
            .unwrap();
        recv_socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();

        let mut output = SacnOutput::new(100).unwrap();
        let mut data = [0u8; 512];
        data[0] = 255;
        output.send_universe(1, &data).unwrap();

        let mut buf = [0u8; 1024];
        let (len, _addr) = recv_socket.recv_from(&mut buf).unwrap();
        assert_eq!(len, 638);
        // Verify DMX channel 1 = 255
        assert_eq!(buf[126], 255);
    }
}
