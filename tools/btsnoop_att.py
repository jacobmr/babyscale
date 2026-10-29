import struct, sys, datetime
d=open(sys.argv[1],'rb').read()
assert d[:8]==b'btsnoop\0'
o=16; frags={}
names={0x12:'WRITE_REQ',0x52:'WRITE_CMD',0x1b:'NOTIFY',0x1d:'INDICATE',0x0b:'READ_RSP',0x0a:'READ_REQ',0x09:'RBT_RSP',0x11:'RBGT_RSP'}
while o+24<=len(d):
    ol,il,fl,dr,ts=struct.unpack('>IIIIq',d[o:o+24]); p=d[o+24:o+24+il]; o+=24+il
    if not p or p[0]!=2: continue
    h,ln=struct.unpack('<HH',p[1:5]); conn=h&0xfff; pb=(h>>12)&3; body=p[5:5+ln]
    if pb in (0,2):
        if len(body)<4: continue
        l2len,cid=struct.unpack('<HH',body[:4]); frags[conn]=[l2len,cid,body[4:]]
    else:
        if conn in frags: frags[conn][2]+=body
    if conn not in frags: continue
    l2len,cid,pay=frags[conn]
    if len(pay)<l2len: continue
    del frags[conn]
    if cid!=4 or not pay: continue
    op=pay[0]
    if op not in names: continue
    t=datetime.datetime(1,1,1)+datetime.timedelta(microseconds=ts)
    dirn='tx' if (fl&1)==0 else 'rx'
    if op in (0x12,0x52,0x1b,0x1d):
        hd=struct.unpack('<H',pay[1:3])[0]; v=pay[3:]
        print(t.strftime('%H:%M:%S.%f')[:-3], dirn, names[op], f'h=0x{hd:04x}', v.hex(' '))
    elif op in (0x09,0x11):
        print(t.strftime('%H:%M:%S.%f')[:-3], dirn, names[op], pay[1:].hex(' '))
