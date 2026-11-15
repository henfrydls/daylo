"""Did anything the emulator sent name a host it must never reach?

Usage: capture-guard.py <emulator.pcap> [<github-ranges.txt>]

Read by the emulator measurements in test-build.yml, on the packet capture the emulator
takes from the host side (-tcpdump), so nothing the app or Android does inside the device
can keep a packet out of it.

Two kinds of host, for two reasons:

- checkin.henfrydls.com: an emulator with a fresh install is not a person, and a check-in
  from one is a fake row on the production server.
- GitHub (github.com, and githubusercontent.com where release files are served from):
  the Google Play build must never look for an update outside Play (#200), and the update
  manifest is a file on GitHub's releases.

A host is looked for in three forms: as a DNS question (length-prefixed labels), as plain
text (the TLS server name in a ClientHello, a Host header), and, for GitHub only, as an
address inside the ranges GitHub publishes for its web and API hosts, when the caller
passes them in. Release files are served from a CDN whose addresses are not published, so
for those the name is what is looked for.

Prints what it found and exits 1 if anything was found, 0 if nothing was. A capture
holding no packets is the caller's business: with the radio off from the start the file
is a 24-byte header and nothing else.
"""

import ipaddress
import struct
import sys

HOSTS = ("checkin.henfrydls.com", "github.com", "githubusercontent.com")


def as_labels(host):
    return b"".join(bytes([len(part)]) + part.encode() for part in host.split("."))


def packets(data):
    """Each packet's link type and bytes, from a classic pcap file."""
    if len(data) < 24:
        return
    magic = data[:4]
    if magic in (b"\xd4\xc3\xb2\xa1", b"\x4d\x3c\xb2\xa1"):
        order = "<"
    elif magic in (b"\xa1\xb2\xc3\xd4", b"\xa1\xb2\x3c\x4d"):
        order = ">"
    else:
        raise ValueError("not a classic pcap file: magic %s" % magic.hex())
    link = struct.unpack(order + "I", data[20:24])[0]
    at = 24
    while at + 16 <= len(data):
        length = struct.unpack(order + "I", data[at + 8 : at + 12])[0]
        yield link, data[at + 16 : at + 16 + length]
        at += 16 + length


def addresses(link, frame):
    """Source and destination of an IPv4 or IPv6 packet, or nothing."""
    if link == 1:  # Ethernet
        kind, ip = struct.unpack(">H", frame[12:14])[0], frame[14:]
        if kind == 0x8100 and len(frame) >= 18:  # one VLAN tag
            kind, ip = struct.unpack(">H", frame[16:18])[0], frame[18:]
    elif link in (101, 228, 229):  # raw IP, IPv4, IPv6
        kind, ip = None, frame
    else:
        return []
    version = ip[0] >> 4 if ip else 0
    if (kind in (None, 0x0800)) and version == 4 and len(ip) >= 20:
        return [ipaddress.ip_address(ip[12:16]), ipaddress.ip_address(ip[16:20])]
    if (kind in (None, 0x86DD)) and version == 6 and len(ip) >= 40:
        return [ipaddress.ip_address(ip[8:24]), ipaddress.ip_address(ip[24:40])]
    return []


def main():
    data = open(sys.argv[1], "rb").read()
    found = []
    for host in HOSTS:
        for form, needle in (("DNS", as_labels(host)), ("plain", host.encode())):
            if needle in data:
                found.append("%s (%s)" % (host, form))

    if len(sys.argv) > 2:
        ranges = [
            ipaddress.ip_network(line.strip(), strict=False)
            for line in open(sys.argv[2])
            if line.strip()
        ]
        seen = set()
        for link, frame in packets(data):
            seen.update(addresses(link, frame))
        print("addresses in the capture: %d, GitHub ranges checked: %d" % (len(seen), len(ranges)))
        for address in sorted(seen, key=lambda a: (a.version, int(a))):
            hit = next((r for r in ranges if r.version == address.version and address in r), None)
            if hit is not None:
                found.append("%s (in GitHub's %s)" % (address, hit))

    print("hosts that must not be reached, in the capture:", ", ".join(found) if found else "none")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
