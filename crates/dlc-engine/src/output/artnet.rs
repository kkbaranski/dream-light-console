use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, UdpSocket};

use super::DmxOutput;
use crate::EngineError;

/// Art-Net UDP port.
const ARTNET_PORT: u16 = 6454;

/// ArtDmx packet size: 18-byte header + 512 DMX channels.
const PACKET_SIZE: usize = 530;

/// Art-Net header magic.
const ARTNET_ID: [u8; 8] = *b"Art-Net\0";

/// OpCode for ArtDmx (little-endian 0x5000).
const OPCODE_DMX_LE: [u8; 2] = [0x00, 0x50];

/// Protocol version 14 (big-endian).
const PROTOCOL_VERSION_BE: [u8; 2] = [0x00, 0x0E];

/// Art-Net output adapter.
///
/// Sends ArtDmx packets via UDP unicast or broadcast to port 6454.
pub struct ArtNetOutput {
    socket: UdpSocket,
    target: SocketAddr,
    sequence: HashMap<u16, u8>,
}

impl ArtNetOutput {
    /// Create an Art-Net output that sends to a specific IP address.
    pub fn unicast(target_ip: IpAddr) -> Result<Self, EngineError> {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        Ok(Self {
            socket,
            target: SocketAddr::new(target_ip, ARTNET_PORT),
            sequence: HashMap::new(),
        })
    }

    /// Create an Art-Net output that broadcasts on the local network.
    pub fn broadcast() -> Result<Self, EngineError> {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        socket.set_broadcast(true)?;
        Ok(Self {
            socket,
            target: SocketAddr::new(IpAddr::V4(std::net::Ipv4Addr::BROADCAST), ARTNET_PORT),
            sequence: HashMap::new(),
        })
    }

    /// Build a 530-byte ArtDmx packet.
    fn build_packet(
        universe_id: u16,
        sequence: u8,
        data: &[u8; 512],
    ) -> [u8; PACKET_SIZE] {
        let mut pkt = [0u8; PACKET_SIZE];

        // Header: "Art-Net\0"
        pkt[0..8].copy_from_slice(&ARTNET_ID);
        // OpCode (little-endian 0x5000)
        pkt[8..10].copy_from_slice(&OPCODE_DMX_LE);
        // Protocol version (big-endian 0x000E)
        pkt[10..12].copy_from_slice(&PROTOCOL_VERSION_BE);
        // Sequence
        pkt[12] = sequence;
        // Physical port
        pkt[13] = 0;
        // SubUni (low byte of universe)
        pkt[14] = (universe_id & 0xFF) as u8;
        // Net (high 7 bits of universe)
        pkt[15] = ((universe_id >> 8) & 0x7F) as u8;
        // Length (big-endian, 512)
        pkt[16] = 0x02;
        pkt[17] = 0x00;
        // DMX data
        pkt[18..PACKET_SIZE].copy_from_slice(data);

        pkt
    }
}

impl DmxOutput for ArtNetOutput {
    fn send_universe(&mut self, universe_id: u16, data: &[u8; 512]) -> Result<(), EngineError> {
        let seq = *self.sequence.entry(universe_id).or_insert(0);
        let packet = Self::build_packet(universe_id, seq, data);
        self.sequence.insert(universe_id, seq.wrapping_add(1));

        self.socket.send_to(&packet, self.target)?;
        Ok(())
    }

    fn label(&self) -> &str {
        "artnet"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn artnet_packet_size_is_530() {
        let pkt = ArtNetOutput::build_packet(1, 0, &[0u8; 512]);
        assert_eq!(pkt.len(), 530);
    }

    #[test]
    fn artnet_header_magic() {
        let pkt = ArtNetOutput::build_packet(1, 0, &[0u8; 512]);
        assert_eq!(&pkt[0..8], b"Art-Net\0");
    }

    #[test]
    fn artnet_opcode_is_little_endian() {
        let pkt = ArtNetOutput::build_packet(1, 0, &[0u8; 512]);
        assert_eq!(pkt[8], 0x00);
        assert_eq!(pkt[9], 0x50);
    }

    #[test]
    fn artnet_protocol_version() {
        let pkt = ArtNetOutput::build_packet(1, 0, &[0u8; 512]);
        assert_eq!(pkt[10], 0x00);
        assert_eq!(pkt[11], 0x0E);
    }

    #[test]
    fn artnet_sequence_and_physical() {
        let pkt = ArtNetOutput::build_packet(1, 42, &[0u8; 512]);
        assert_eq!(pkt[12], 42);
        assert_eq!(pkt[13], 0);
    }

    #[test]
    fn artnet_universe_mapping_low() {
        // Universe 3 → SubUni=3, Net=0
        let pkt = ArtNetOutput::build_packet(3, 0, &[0u8; 512]);
        assert_eq!(pkt[14], 3);
        assert_eq!(pkt[15], 0);
    }

    #[test]
    fn artnet_universe_mapping_high() {
        // Universe 0x0301 (769) → SubUni=0x01, Net=0x03
        let pkt = ArtNetOutput::build_packet(0x0301, 0, &[0u8; 512]);
        assert_eq!(pkt[14], 0x01);
        assert_eq!(pkt[15], 0x03);
    }

    #[test]
    fn artnet_universe_net_masks_high_bit() {
        // Universe 0xFF01 → SubUni=0x01, Net=0x7F (top bit masked)
        let pkt = ArtNetOutput::build_packet(0xFF01, 0, &[0u8; 512]);
        assert_eq!(pkt[14], 0x01);
        assert_eq!(pkt[15], 0x7F);
    }

    #[test]
    fn artnet_length_field() {
        let pkt = ArtNetOutput::build_packet(1, 0, &[0u8; 512]);
        // 512 big-endian = 0x0200
        assert_eq!(pkt[16], 0x02);
        assert_eq!(pkt[17], 0x00);
    }

    #[test]
    fn artnet_dmx_data() {
        let mut data = [0u8; 512];
        data[0] = 255;
        data[511] = 128;
        let pkt = ArtNetOutput::build_packet(1, 0, &data);
        assert_eq!(pkt[18], 255);
        assert_eq!(pkt[529], 128);
    }

    #[test]
    fn artnet_sequence_wraps() {
        let mut output = ArtNetOutput::unicast(IpAddr::V4(Ipv4Addr::LOCALHOST)).unwrap();
        output.sequence.insert(1, 255);
        let _ = output.send_universe(1, &[0u8; 512]);
        assert_eq!(*output.sequence.get(&1).unwrap(), 0);
    }

    #[test]
    fn artnet_label() {
        let output = ArtNetOutput::unicast(IpAddr::V4(Ipv4Addr::LOCALHOST)).unwrap();
        assert_eq!(output.label(), "artnet");
    }

    #[test]
    fn artnet_implements_send() {
        fn assert_send<T: Send>() {}
        assert_send::<ArtNetOutput>();
    }

    #[test]
    fn artnet_broadcast_creates_output() {
        let output = ArtNetOutput::broadcast().unwrap();
        assert_eq!(output.label(), "artnet");
    }

    #[test]
    #[ignore] // Requires network — run manually
    fn artnet_integration_send_and_receive() {
        use std::time::Duration;

        let recv_socket = UdpSocket::bind(format!("0.0.0.0:{ARTNET_PORT}")).unwrap();
        recv_socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();

        let mut output = ArtNetOutput::unicast(IpAddr::V4(Ipv4Addr::LOCALHOST)).unwrap();
        let mut data = [0u8; 512];
        data[0] = 255;
        output.send_universe(1, &data).unwrap();

        let mut buf = [0u8; 1024];
        let (len, _addr) = recv_socket.recv_from(&mut buf).unwrap();
        assert_eq!(len, 530);
        assert_eq!(&buf[0..8], b"Art-Net\0");
        assert_eq!(buf[18], 255);
    }
}
