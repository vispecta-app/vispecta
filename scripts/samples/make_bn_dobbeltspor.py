"""
Vispecta sample: a fictitious double-track railway for 180 km/h, 2.5 km, as IFC 4.3 (IFC4X3_ADD2),
one file per discipline, plus a survey point cloud. Everything is generated; nothing is surveyed.

    pip install ifcopenshell ifcpatch numpy laspy[lazrs]
    python scripts/samples/make_bn_dobbeltspor.py public/samples/bn-dobbeltspor
    ALIGN_ONLY=1 python scripts/samples/make_bn_dobbeltspor.py public/samples/bn-dobbeltspor

The second run writes 01-Linjefoering.ifc (the alignments only); the first writes the other files
and 00-Samlet.ifc (everything in one file, not used by the sample).

Banedanmark norms the model follows (see public/samples/bn-dobbeltspor/README.md for the details):
  BN1-6-7   cross section (double track fs = 4.50 m, Bsk, Bt, Ut 2 x 0.20 m, Pb, 40 permille),
            transition wedges Loz = 17 m at the bridge (15.1, figure 12.1-1)
  BN1-11-1  ditches in fill (Bilag 1.1), fall >= 2 permille, wells with sand traps, lined outlet
  BN1-13-4  cable troughs over ground (12.7.1, table 12.7-1)
  BN1-59-5  railway bridge cross section and drainage (11.2)
  BN1-154-3 frispormærker (f0 = 4.25 m)
  BN1-160-1 km marks every 200 m
  BN1-214-3 Sicat SX overhead contact line components
  Sporteknik / GAB Spor 0-1: S99 sleepers, 60E1 rails inclined 1:40
Assumptions where a norm gives no value are written in the property sets ("Antaget").
"""
import math, sys
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.alignment as al
import ifcopenshell.guid

import os
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else 'bn-dobbeltspor'
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, '00-Samlet.ifc')
ALIGN_ONLY = os.environ.get('ALIGN_ONLY') == '1'

V = 180
FS = 4.50                       # track spacing
BSK, A_BAL, BT, UT1, UT2, PB, XP = 0.55, 1.5, 0.35, 0.20, 0.20, 3.80, 0.040
RAIL_H, PAD, SL_LEN, SL_H, RHD = 0.172, 0.010, 2.50, 0.206, 1.500   # S99: 2500 mm long, 206 mm high at the rail seat (Banedanmark, Sporteknik)
RAIL_INCL = 1 / 40              # rail inclination 1:40 (GAB Spor bilag 0-1)
# 60E1 (EN 13674-1): height 172, foot 150, head 72, web 16.5 mm - outline from the foot centre, one half mirrored
_half = [(0.075, 0.0), (0.075, 0.0115), (0.068, 0.0135), (0.030, 0.0240), (0.0160, 0.0300), (0.0105, 0.0370), (0.00825, 0.0470),
         (0.00825, 0.1180), (0.0105, 0.1240), (0.0170, 0.1285), (0.0360, 0.1350), (0.0365, 0.1580), (0.0355, 0.1630), (0.0320, 0.1680),
         (0.0250, 0.1710), (0.0120, 0.1718)]
RAIL_PROFILE = _half + [(0.0, 0.172)] + [(-x, y) for x, y in reversed(_half)]
EMB = 2.0                       # embankment slope 1:2, assumed
# Railway bridge per BN1-59-5 (20.11.2024), section 11.2: 20 m slab bridge over a stream, no ballast walls (V > 160)
BR_S0, BR_S1, BR_WALL = 195.0, 215.0, 1.0       # deck from 12+195 to 12+215, abutment walls 1.0 m thick under the deck ends
BR_SO_DECK = 0.80                               # SO to top of protection concrete under the rails: >= 0.75 m + 0.05 m construction tolerance
BR_XF, BR_LF, BR_CF = 0.025, 0.010, 0.110       # cross fall, longitudinal fall, counter fall at the edge beams (11.2.7)
BR_FREE, BR_PASS, BR_KANT = 4.00, 0.80, 0.55    # CL track -> inside railing, service passage, edge upstand (300 + 200 + 50 tolerance)
BR_KB_IN = BR_FREE - BR_PASS - 0.10             # inner foot of the edge beam (inner face sloped 1:5, 0.55 m high -> 0.11 m)
BR_SLAB, BR_OUT = 1.05, 0.25                    # slab thickness, edge beam outside the railing
STREAM = (205.0, 4.0, 1.2)
MT = 0.20                                        # topsoil on the embankment slopes
# Crossover from track 1 to track 2 (two turnouts 60E1-500-1:12, simplified: arc R = 500 to 1:12, straight, arc back)
XO_S, XO_R, XO_A = 330.0, 500.0, math.atan(1 / 12)
XO_X1 = XO_R * math.sin(XO_A); XO_OFF = XO_R * (1 - math.cos(XO_A))
XO_LS = (FS - 2 * XO_OFF) / math.sin(XO_A); XO_X2 = XO_X1 + XO_LS * math.cos(XO_A); XO_X3 = XO_X2 + XO_X1
XO_ZONE = (XO_S - 3.0, XO_S + XO_X3 + 3.0)       # long turnout sleepers and a level ballast bed between the tracks
def xo_v(x):
    # lateral position (left +) of the crossover centre line x m after its start on track 1, and its angle
    if x <= XO_X1:
        th = math.asin(max(0.0, x) / XO_R); return -XO_R * (1 - math.cos(th)), th
    if x <= XO_X2:
        return -(XO_OFF + (x - XO_X1) * math.tan(XO_A)), XO_A
    th = math.asin(max(0.0, XO_X3 - x) / XO_R); return -FS + XO_R * (1 - math.cos(th)), th
# Transition zones per BN1-6-7 section 15.1 and figure 12.1-1: a triangular wedge of stable gravel against
# the abutment, at least 0.50 m below the normal stable gravel layer at the abutment, running out over
# Loz = 17 m (160 < V <= 200 km/h); filter material and a drain pipe along the back of the abutment.
LOZ, WEDGE_D, FILTER_W, DRAIN_D = 17.0, 0.50, 0.30, 0.16
def wedge_depth(s):
    x = BR_S0 - s if s <= BR_S0 else (s - BR_S1 if s >= BR_S1 else 0.0)
    return UT1 + WEDGE_D * max(0.0, 1.0 - x / LOZ)                      # stream under the bridge: centre, bottom width, depth (slopes 1:2)
SL_SPACING, SL_W = 0.625, 0.30  # sleeper spacing (centre to centre) and width at the base
CRIB = 0.03                     # the ballast surface lies 3 cm below the sleeper top, so the sleepers show
# Drainage per BN1-11-1 (01.10.2006), section 12.1 and Bilag 1.1 (ditch at new construction in fill):
# ditch beyond the embankment toe and a grøftebanket, depth >= 0.50 m, bottom width >= 0.35 m, side
# slopes 1:1.5, longitudinal fall >= 2 permille, outlet through a well >= 300 mm with a sand trap.
D_DITCH, B_DITCH, A_DITCH, FALL_MIN = 0.50, 0.35, 1.5, 0.002
GB = 1.00                       # grøftebanket width (assumed; Bilag 1.1 shows a banket without a minimum)
WELL_D, WELL_H = 0.40, 1.00     # outlet well: outer diameter (315 mm inside) and depth below the ditch bottom
# Cable troughs per BN1-13-4 (23.07.2024), section 12.7.1: over ground outside the planum width,
# >= 3.25 m from the nearest rail (V > 120 km/h, table 12.7-1), >= 2.50 m from the track centre,
# at most 0.20 m above the surrounding ground, must not hinder drainage.
KB = 1.20                       # kabelbanket: planum and sub-ballast carried on 1.20 m beyond Pb
CT_RAIL, CT_W, CT_H, CT_EMBED = 3.25, 0.36, 0.30, 0.15   # distance to rail, trough width, height, set into the banket
RAIL_FOOT = 0.075               # half the 60E1 foot width: the distance to the rail is taken from its outer edge
CT_IN = 4.10                    # inner face of the trough from the track centre (>= 0.75 + 0.075 + 3.25 = 4.075, rounded up)
CT_WALL, CT_LID = 0.06, 0.04
R, D_CANT, LCL = 2000.0, 0.110, 180.0
START_STATION = 12000.0
STEP = 5.0
TRACKS = [0.0, -FS]             # lateral position of the track centres from track 1 (left +)
VR = -FS / 2                    # the middle between the tracks: top of the planum

f = ifcopenshell.api.run('project.create_file', version='IFC4X3_ADD2')
run = lambda cmd, **kw: ifcopenshell.api.run(cmd, f, **kw)
project = run('root.create_entity', ifc_class='IfcProject', name='Dobbeltsporet bane 180 km/h – BN1-6-7')
run('unit.assign_unit', length={'is_metric': True, 'raw': 'METERS'})
ctx = run('context.add_context', context_type='Model')
body = run('context.add_context', context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=ctx)
crs = f.createIfcProjectedCRS('EPSG:25832', 'ETRS89 / UTM zone 32N', 'ETRS89', 'DVR90', 'UTM', '32N', None)
f.createIfcMapConversion(ctx, crs, 680000.0, 6150000.0, 0.0, 1.0, 0.0, None)

site = run('root.create_entity', ifc_class='IfcSite', name='Strækning')
rail = run('root.create_entity', ifc_class='IfcRailway', name='Ny bane, dobbeltsporet, 180 km/h')
part_t1 = run('root.create_entity', ifc_class='IfcRailwayPart', name='Spor 1 – overbygning', predefined_type='TRACK')
part_t2 = run('root.create_entity', ifc_class='IfcRailwayPart', name='Spor 2 – overbygning', predefined_type='TRACK')
part_sub = run('root.create_entity', ifc_class='IfcRailwayPart', name='Underbygning og jordarbejder', predefined_type='SUBSTRUCTURE')
part_drain = run('root.create_entity', ifc_class='IfcRailwayPart', name='Afvanding (BN1-11)', predefined_type='USERDEFINED')
part_cable = run('root.create_entity', ifc_class='IfcRailwayPart', name='Kabelanlæg langs sporet (BN1-13)', predefined_type='LINESIDE')
part_ocs = run('root.create_entity', ifc_class='IfcRailwayPart', name='Køreledningsanlæg (Sicat SX, 25 kV 50 Hz)', predefined_type='ABOVETRACK')
for part, pt, ot in ((part_t1, 'TRACK', None), (part_t2, 'TRACK', None), (part_sub, 'SUBSTRUCTURE', None), (part_drain, 'USERDEFINED', 'DRAINAGE'), (part_cable, 'LINESIDE', None), (part_ocs, 'ABOVETRACK', None)):
    part.PredefinedType, part.ObjectType, part.UsageType = pt, ot, 'LONGITUDINAL'
run('aggregate.assign_object', relating_object=project, products=[site])
run('aggregate.assign_object', relating_object=site, products=[rail])
run('aggregate.assign_object', relating_object=rail, products=[part_t1, part_t2, part_sub, part_drain, part_cable, part_ocs])
for p in (site, rail, part_t1, part_t2, part_sub, part_drain, part_cable, part_ocs):
    run('geometry.edit_object_placement', product=p)

curv = lambda r: 0.0 if r == 0 else 1.0 / r

def integrate(segs, x, y, th):
    """Start point (x, y, heading) of every segment; curvature linear in s within a segment."""
    starts = []
    for kind, L, r0, r1 in segs:
        starts.append((x, y, th))
        n = max(1, int(L / 0.01))
        ds = L / n
        for i in range(n):
            k0 = curv(r0) + (curv(r1) - curv(r0)) * (i / n)
            k1 = curv(r0) + (curv(r1) - curv(r0)) * ((i + 1) / n)
            x += ds * math.cos(th + (k0 + k1) / 4 * ds)
            y += ds * math.sin(th + (k0 + k1) / 4 * ds)
            th += (k0 + k1) / 2 * ds
    return starts

# ------------------------------------------------------------------ track 1
segs1 = [('LINE', 600.0, 0.0, 0.0), ('CLOTHOID', LCL, 0.0, R), ('CIRCULARARC', 800.0, R, R), ('CLOTHOID', LCL, R, 0.0), ('LINE', 740.0, 0.0, 0.0)]
TH0 = 0.35
TOTAL1 = sum(s[1] for s in segs1)
# heading change from the start along track 1 (left turn +), for the length of the parallel track
def turned(s):
    a, acc = 0.0, 0.0
    for kind, L, r0, r1 in segs1:
        if s <= acc + L:
            x = s - acc
            return a + curv(r0) * x + (curv(r1) - curv(r0)) * x * x / (2 * L)
        a += (curv(r0) + curv(r1)) / 2 * L
        acc += L
    return a
# track 2 lies FS to the right. Each of its segments turns exactly as much as on track 1, so the
# spacing stays FS: lines keep their length, the arc and the clothoids get L2 = L1 · R2 / R1.
segs2 = []
for kind, L, r0, r1 in segs1:
    r = max(r0, r1)
    L2 = L if kind == 'LINE' else L * (r + FS) / r
    segs2.append((kind, L2, r0 + FS if r0 else 0.0, r1 + FS if r1 else 0.0))
# the arcs must be concentric: the circle centre lies x_m = X(L) - R sin(theta(L)) beyond the start
# of the clothoid (along the tangent). Track 2's longer clothoid would put it further on, so its
# first line is shortened and its last line lengthened by the difference.
def clothoid_xm(L, Rr):
    n = 20000; ds = L / n; xx = 0.0; th = 0.0
    for i in range(n):
        k = (i + 0.5) / n * L / (Rr * L)   # curvature at the middle of the step
        xx += ds * math.cos(th + k * ds / 2); th += k * ds
    return xx - Rr * math.sin(th)
DELTA = clothoid_xm(segs2[1][1], R + FS) - clothoid_xm(LCL, R)
segs2[0] = (segs2[0][0], segs2[0][1] - DELTA, 0.0, 0.0)
segs2[4] = (segs2[4][0], segs2[4][1] + DELTA, 0.0, 0.0)
# distance along track 2 at the section through track 1 at s (piecewise linear per segment)
def s2_of(s):
    a1 = a2 = 0.0
    for (k1, L1, *_), (k2, L2, *_) in zip(segs1, segs2):
        if s <= a1 + L1 + 1e-9:
            return a2 + (s - a1) * L2 / L1
        a1 += L1; a2 += L2
    return a2 + (s - a1)
x2 = 0.0 + FS * math.sin(TH0)       # right of track 1: (sin, -cos)
y2 = 0.0 - FS * math.cos(TH0)

# vertical of track 1 (height of the lower rail): +5 ‰, crest R 20 000, -6 ‰, sag R 20 000, +3 ‰
RV = 20000.0
g = [0.005, -0.006, 0.003]
pvi = [900.0, 1900.0]
vsegs1 = []
s_prev, h_prev = 0.0, 25.0
for i in (1, 2):
    Lc = RV * abs(g[i] - g[i - 1])
    s_pvc = pvi[i - 1] - Lc / 2
    vsegs1.append(('CONSTANTGRADIENT', s_prev, s_pvc - s_prev, h_prev, g[i - 1], g[i - 1]))
    h_pvc = h_prev + g[i - 1] * (s_pvc - s_prev)
    vsegs1.append(('PARABOLICARC', s_pvc, Lc, h_pvc, g[i - 1], g[i]))
    s_prev, h_prev = s_pvc + Lc, h_pvc + g[i - 1] * Lc + (g[i] - g[i - 1]) / 2 * Lc
vsegs1.append(('CONSTANTGRADIENT', s_prev, TOTAL1 - s_prev, h_prev, g[2], g[2]))

def height(s):   # track 1 profile; track 2 follows it at the same section
    for kind, s0, L, h0, g0, g1 in vsegs1:
        if s <= s0 + L + 1e-9:
            xx = max(0.0, s - s0)
            return h0 + g0 * xx + ((g1 - g0) / (2 * L) * xx * xx if kind == 'PARABOLICARC' else 0.0)
    kind, s0, L, h0, g0, g1 = vsegs1[-1]
    return h0 + g0 * L

csegs1 = [('CONSTANTCANT', 0.0, 600.0, 0.0, 0.0), ('LINEARTRANSITION', 600.0, LCL, 0.0, D_CANT), ('CONSTANTCANT', 600.0 + LCL, 800.0, D_CANT, D_CANT),
          ('LINEARTRANSITION', 1400.0 + LCL, LCL, D_CANT, 0.0), ('CONSTANTCANT', 1400.0 + 2 * LCL, TOTAL1 - 1400.0 - 2 * LCL, 0.0, 0.0)]
def cant(s):
    for kind, s0, L, d0, d1 in csegs1:
        if s <= s0 + L + 1e-9:
            return d0 + (d1 - d0) * max(0.0, s - s0) / L
    return 0.0

def build_alignment(name, segs, x0, y0, smap):
    """An alignment with horizontal, vertical and cant layouts; smap maps track-1 distances to its own."""
    a = al.create(f, name, include_vertical=True, include_cant=True)
    hz, vt, ct = al.get_horizontal_layout(a), al.get_vertical_layout(a), al.get_cant_layout(a)
    ct.RailHeadDistance = RHD
    starts = integrate(segs, x0, y0, TH0)
    for (kind, L, r0, r1), (sx, sy, sth), tag in zip(segs, starts, ['LG1', 'KL1', 'CB1', 'KL2', 'LG2']):
        al.create_layout_segment(f, hz, f.createIfcAlignmentHorizontalSegment(tag, None, f.createIfcCartesianPoint((sx, sy)), sth, r0, r1, L, None, kind))
    # vertical: the same heights at the same sections, the distances mapped to this track
    for i, (kind, s0, L, h0, g0, g1) in enumerate(vsegs1):
        a0, a1 = smap(s0), smap(s0 + L)
        L2 = a1 - a0
        k = L / L2   # gradients scale with the length
        rc = (RV / k if g1 > g0 else -RV / k) if kind == 'PARABOLICARC' else None
        al.create_layout_segment(f, vt, f.createIfcAlignmentVerticalSegment(f'V{i + 1}', None, a0, L2, h0, g0 * k, g1 * k, rc, kind))
    for i, (kind, s0, L, d0, d1) in enumerate(csegs1):
        a0, a1 = smap(s0), smap(s0 + L)
        al.create_layout_segment(f, ct, f.createIfcAlignmentCantSegment(f'C{i + 1}', None, a0, a1 - a0, 0.0, 0.0, d0, d1, kind))
    al.add_stationing_referent(f, '12+000', a, 0.0, START_STATION)
    run('spatial.reference_structure', products=[a], relating_structure=rail)
    return a, starts

align1, st1 = build_alignment('Spor 1', segs1, 0.0, 0.0, lambda s: s)
align2, st2 = build_alignment('Spor 2', segs2, x2, y2, s2_of)
if ALIGN_ONLY:
    project.Name = 'Linjeføring – dobbeltsporet bane 180 km/h (BN1-6-7)'
    for p_ in (part_t1, part_t2, part_sub, part_drain, part_cable, part_ocs):
        ifcopenshell.api.run('root.remove_product', f, product=p_)
    f.write(os.path.join(OUT_DIR, '01-Linjefoering.ifc'))
    print('written alignments')
    sys.exit(0)

basis1 = al.get_basis_curve(align1)
basis2 = al.get_basis_curve(align2)
def frame(basis, s):
    m = al.evaluate_representation(basis, s)   # row-major: translation in the last row, tangent in the first
    tx, ty = m[0][0], m[0][1]
    n = math.hypot(tx, ty)
    return m[3][0], m[3][1], tx / n, ty / n

# checks: the IFC geometry follows the own integration, and track 2 stays FS to the right of track 1
acc = 0.0
for (kind, L, r0, r1), (sx, sy, _) in zip(segs1, st1):
    px, py, _, _ = frame(basis1, acc)
    assert math.hypot(px - sx, py - sy) < 0.05, ('track 1 geometry', acc, px, py, sx, sy)
    acc += L
worst = 0.0
for i in range(0, int(TOTAL1) + 1, 10):
    px, py, tx, ty = frame(basis1, float(i))
    qx, qy, _, _ = frame(basis2, s2_of(float(i)))
    off = (qx - px) * (-ty) + (qy - py) * tx      # left offset of track 2 from track 1
    worst = max(worst, abs(off + FS))
print('track spacing: largest deviation from 4.500 m:', round(worst * 1000, 1), 'mm')

# ------------------------------------------------------------------ cross section per BN1-6-7, double track
def section(s, z_terrain):
    z_low = height(s)
    D = cant(s)
    t = math.asin(D / RHD)
    e = (-math.cos(t), math.sin(t))          # along the SO plane, left -> right
    nrm = (math.sin(t), math.cos(t))
    top = RAIL_H + PAD
    def Pf(c):    # point on track c: u along the SO plane (right +), d below the SO plane
        lr = (c + RHD / 2, z_low)            # the lower (left) rail lies on the profile
        C = (lr[0] + e[0] * RHD / 2, lr[1] + e[1] * RHD / 2)
        return lambda u, d: (C[0] + e[0] * u - nrm[0] * d, C[1] + e[1] * u - nrm[1] * d)
    P = [Pf(c) for c in TRACKS]
    # planum: top in the middle between the tracks, 40 ‰ down to both sides; Bt >= 0.35 under every rail
    under = [Pk(u, top + SL_H) for Pk in P for u in (-RHD / 2, RHD / 2)]
    a = min(zb + XP * abs(vb - VR) for vb, zb in under) - BT
    zp = lambda v: a - XP * abs(v - VR)
    edge_l, edge_r = TRACKS[0] + PB, TRACKS[1] - PB
    # ballast: outer shoulders, the two inner shoulders and the V between them
    half = SL_LEN / 2 + BSK
    o_l, i_1 = P[0](-half, top + CRIB), P[0](half, top + CRIB)
    i_2, o_r = P[1](-half, top + CRIB), P[1](half, top + CRIB)
    # the inner slopes (1:1.5) meet: z = i1.z - (i1.v - v)/A and z = i2.z - (v - i2.v)/A
    vv = A_BAL / 2 * (i_2[1] - i_1[1]) + (i_1[0] + i_2[0]) / 2
    vee = (vv, i_1[1] - (i_1[0] - vv) / A_BAL)
    if XO_ZONE[0] <= s <= XO_ZONE[1]:                 # crossover: a level ballast bed under the long turnout sleepers
        vee = ((i_1[0] + i_2[0]) / 2, (i_1[1] + i_2[1]) / 2)
    def toe(pt, side):   # outer slope 1:1.5 from pt down to the planum (side +1: left, -1: right)
        # z = pt.z - side*(v - pt.v)/A  and  z = a - XP*|v - VR| with v on that side of VR
        sg = 1 if side > 0 else -1
        # a - XP*sg*(v - VR) = pt.z - side*(v - pt.v)/A
        vv = (pt[1] + side * pt[0] / A_BAL - a - XP * sg * VR) / (side / A_BAL - XP * sg)
        return (vv, zp(vv))
    ballast = [o_l, i_1, vee, i_2, o_r, toe(o_r, -1), (VR, zp(VR)), toe(o_l, 1)]
    edge_lo, edge_ro = edge_l + KB, edge_r - KB   # the layers go on to the kabelbanket edge, still falling 40 permille
    def band(d0, d1):   # sub-ballast layer between d0 and d1 below the planum, out to the embankment slopes
        sl = lambda edge, side, d: (edge + side * EMB * d, zp(edge) - d)
        return [sl(edge_lo, 1, d0), (VR, zp(VR) - d0), sl(edge_ro, -1, d0), sl(edge_ro, -1, d1), (VR, zp(VR) - d1), sl(edge_lo, 1, d1)]
    dw = wedge_depth(s)                                  # bottom of the stable gravel (wedge) below the planum
    D = max(dw, UT1 + UT2)                               # top of the fill
    sub1, sub2 = band(0.0, UT1), band(min(dw, UT1 + UT2), UT1 + UT2)
    wedge = band(UT1, dw)
    bot = band(D, D)
    # cable troughs: inner face CT_RAIL from the outer rail of the outer track, laid level, set CT_EMBED into the banket
    tl_in = TRACKS[0] + CT_IN; tl_out = tl_in + CT_W
    tr_in = TRACKS[1] - CT_IN; tr_out = tr_in - CT_W
    zl, zr = zp(tl_in) - CT_EMBED, zp(tr_in) - CT_EMBED
    notch_l = [(tl_out, zp(tl_out)), (tl_out, zl), (tl_in, zl), (tl_in, zp(tl_in))]
    notch_r = [(tr_in, zp(tr_in)), (tr_in, zr), (tr_out, zr), (tr_out, zp(tr_out))]
    sub1 = [sub1[0]] + notch_l + [sub1[1]] + notch_r + sub1[2:]
    def trough(vin, vout, zb):
        sg = 1 if vout > vin else -1
        w, hb = CT_WALL * sg, CT_H - CT_LID
        body = [(vin, zb), (vout, zb), (vout, zb + hb), (vout - w, zb + hb), (vout - w, zb + CT_WALL), (vin + w, zb + CT_WALL), (vin + w, zb + hb), (vin, zb + hb)]
        lid = [(vin, zb + hb), (vout, zb + hb), (vout, zb + CT_H), (vin, zb + CT_H)]
        return (body if sg > 0 else body[::-1]), (lid if sg > 0 else lid[::-1])
    ctl_body, ctl_lid = trough(tl_in, tl_out, zl)
    ctr_body, ctr_lid = trough(tr_in, tr_out, zr)
    fl, fm, fr = bot[5], bot[4], bot[3]
    def ground(pt, side):   # embankment slope 1:2 from pt to the terrain z = zt0 + k v
        zt0 = z_terrain(0.0); k = z_terrain(1.0) - zt0
        vv = (pt[1] + side * pt[0] / EMB - zt0) / (k + side / EMB)
        return (vv, zt0 + k * vv)
    emb = [fl, fm, fr, ground(fr, -1), ground(fl, 1)]
    zt0 = z_terrain(0.0); kt_ = z_terrain(1.0) - zt0
    def topsoil(A, T, side):   # MT of topsoil on the slope from the banket edge A down to the toe T
        dv = MT / (1 / EMB - XP)
        B = (A[0] + side * dv, A[1] - XP * dv)
        if side > 0: v2 = (A[1] + MT + A[0] / EMB - zt0) / (1 / EMB + kt_)
        else: v2 = (zt0 - A[1] - MT + A[0] / EMB) / (1 / EMB - kt_)
        T2 = (v2, zt0 + kt_ * v2)
        return [A, B, T2, T], T2
    muld_l, toe2_l = topsoil((edge_lo, zp(edge_lo)), emb[4], 1)
    muld_r, toe2_r = topsoil((edge_ro, zp(edge_ro)), emb[3], -1)
    def rail_poly(Pk, u):
        prof = RAIL_PROFILE
        sg = 1 if u < 0 else -1          # towards the track centre (u = 0)
        a = math.atan(RAIL_INCL); ca, sa = math.cos(a), math.sin(a)
        return [Pk(u + px * ca + sg * py * sa, RAIL_H - (-sg * px * sa + py * ca)) for px, py in prof][::-1]
    out = {'ballast': ballast, 'sub1': sub1, 'sub2': sub2, 'emb': emb, 'wedge': wedge, 'ctl_body': ctl_body, 'ctl_lid': ctl_lid, 'ctr_body': ctr_body, 'ctr_lid': ctr_lid,
           'muld_l': muld_l, 'muld_r': muld_r, 'toe_l': toe2_l, 'toe_r': toe2_r, 'toe_fill': (emb[4], emb[3]), 'zp': zp, 'edges': (edge_lo, edge_ro), 'ct_check': (tl_in, tl_out, tr_in, tr_out, zl + CT_H - zp(tl_out), zr + CT_H - zp(tr_out), edge_l, edge_r)}
    for k, Pk in enumerate(P):
        out[f'rail{k + 1}l'] = rail_poly(Pk, -RHD / 2)
        out[f'rail{k + 1}r'] = rail_poly(Pk, RHD / 2)
    return out

# terrain under the formation everywhere (fill), undulating along, falling 1.2 % to the right
def stream_dip(s):
    c, b, d = STREAM
    x = abs(s - c) - b / 2
    return d if x <= 0 else max(0.0, d - x / 2.0)

def terrain_at(s, v):
    return -stream_dip(s) + height(s) - 2.6 - 0.9 * math.sin(2 * math.pi * s / 760.0) - 0.4 * math.sin(2 * math.pi * s / 230.0) + 0.012 * v

# ------------------------------------------------------------------ meshes
stations = sorted(set([i * STEP for i in range(int(TOTAL1 / STEP))] + [TOTAL1, BR_S0, BR_S1, BR_S0 - LOZ, BR_S1 + LOZ, BR_S0 - FILTER_W, BR_S1 + FILTER_W, XO_ZONE[0], XO_ZONE[1], XO_ZONE[0] - 2.0, XO_ZONE[1] + 2.0, 198.0, 212.0]))
frames = [frame(basis1, s) for s in stations]
secs = [section(s, lambda v, s=s: terrain_at(s, v)) for s in stations]

def world(fr, v, z):
    px, py, tx, ty = fr
    return (px - ty * v, py + tx * v, z)

def ear_clip(poly):
    """Triangles (index triples) of a simple polygon in 2D, any orientation."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c):
        return cross(a, b, p) >= 0 and cross(b, c, p) >= 0 and cross(c, a, p) >= 0
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 1000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cross(a, b, c) <= 1e-12: continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)): continue
            tris.append((i0, i1, i2)); idx.pop(k); break
    tris += [(idx[0], idx[k], idx[k + 1]) for k in range(1, len(idx) - 1)]   # what is left (degenerate): a fan
    return tris

SPLIT = {'ballast', 'emb', 'muld_l', 'muld_r'}                                                                   # interrupted by the bridge
SPLIT_F = {'sub1', 'sub2', 'ctl_body', 'ctl_lid', 'ctr_body', 'ctr_lid'}                      # stop at the filter behind the abutments
def sweep(key):
    pts, tris = [], []
    n = len(secs[0][key])
    idx = list(range(len(stations)))
    g = FILTER_W if key in SPLIT_F else 0.0
    runs = [[i for i in idx if stations[i] <= BR_S0 - g + 1e-9], [i for i in idx if stations[i] >= BR_S1 + g - 1e-9]] if key in SPLIT | SPLIT_F else [idx]
    for run_ in runs:
        o = len(pts)
        for i in run_:
            for v, z in secs[i][key]:
                pts.append(world(frames[i], v, z))
        for r in range(len(run_) - 1):
            a0, b0 = o + r * n, o + (r + 1) * n
            for j in range(n):
                j2 = (j + 1) % n
                tris += [(a0 + j, b0 + j, b0 + j2), (a0 + j, b0 + j2, a0 + j2)]
        last = o + (len(run_) - 1) * n
        for a, b, c in ear_clip(secs[run_[0]][key]): tris.append((o + c, o + b, o + a))
        for a, b, c in ear_clip(secs[run_[-1]][key]): tris.append((last + a, last + b, last + c))
    return pts, tris

def mesh_shape(pts, tris, closed=True):
    pl = f.createIfcCartesianPointList3D([tuple(float(c) for c in p) for p in pts])
    fs = f.createIfcTriangulatedFaceSet(pl, None, closed, [(a + 1, b + 1, c + 1) for a, b, c in tris], None)
    return f.createIfcShapeRepresentation(body, 'Body', 'Tessellation', [fs])

def style(name, rgb):
    st = run('style.add_style', name=name)
    run('style.add_surface_style', style=st, ifc_class='IfcSurfaceStyleShading', attributes={'SurfaceColour': {'Name': None, 'Red': rgb[0], 'Green': rgb[1], 'Blue': rgb[2]}, 'Transparency': 0.0})
    return st

def w3(fr, v, a, z):   # section frame -> world, a along the track
    px, py, tx, ty = fr
    return (px - ty * v + tx * a, py + tx * v + ty * a, z)

def cyl(p0, p1, r, n=8):
    ax = [p1[i] - p0[i] for i in range(3)]; L = math.sqrt(sum(x * x for x in ax)) or 1e-9
    ax = [x / L for x in ax]
    ref = (0, 0, 1) if abs(ax[2]) < 0.9 else (1, 0, 0)
    u = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]
    lu = math.sqrt(sum(x * x for x in u)); u = [x / lu for x in u]
    w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]]
    pts = []
    for p in (p0, p1):
        for k in range(n):
            a = 2 * math.pi * k / n
            pts.append(tuple(p[i] + r * (math.cos(a) * u[i] + math.sin(a) * w[i]) for i in range(3)))
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        tris += [(k, k2, k2 + n), (k, k2 + n, k + n)]
    for k in range(1, n - 1): tris += [(0, k + 1, k), (n, n + k, n + k + 1)]
    return pts, tris

def merge(*meshes):
    P, T = [], []
    for p, t in meshes:
        o = len(P); P += list(p); T += [(a + o, b + o, c + o) for a, b, c in t]
    return P, T

def prism(poly, z0, z1, fr, v0, a0=0.0):
    n = len(poly)
    pts = [w3(fr, v0 + v, a0 + a, z0) for v, a in poly] + [w3(fr, v0 + v, a0 + a, z1) for v, a in poly]
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        tris += [(k, k2, k2 + n), (k, k2 + n, k + n)]
    for a, b, c in ear_clip(poly): tris += [(c, b, a), (a + n, b + n, c + n)]
    return pts, tris

def gloft(key, sts, frs, secs_):
    # a solid through the section polygons secs_[i][key] at stations sts with frames frs (constant point count)
    pts, tris = [], []
    n = len(secs_[0][key])
    for fr, sc in zip(frs, secs_):
        for v, z in sc[key]: pts.append(world(fr, v, z))
    for i in range(len(sts) - 1):
        a0, b0 = i * n, (i + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            tris += [(a0 + j, b0 + j, b0 + j2), (a0 + j, b0 + j2, a0 + j2)]
    last = (len(sts) - 1) * n
    for a, b, c in ear_clip(secs_[0][key]): tris.append((c, b, a))
    for a, b, c in ear_clip(secs_[-1][key]): tris.append((last + a, last + b, last + c))
    return pts, tris

FAG = {}            # discipline -> elements (each becomes an IFC file of its own)
CUR = ['02-Spor']
def fagtag(el, fag=None):
    FAG.setdefault(fag or CUR[0], []).append(el)
    return el

def element(cls, name, mesh, container, st, predefined=None, object_type=None, closed=True, psets=None):
    el = run('root.create_entity', ifc_class=cls, name=name, predefined_type=predefined)
    if object_type: el.ObjectType = object_type
    run('geometry.edit_object_placement', product=el)
    pts, tris = sweep(mesh) if isinstance(mesh, str) else mesh
    rep = mesh_shape(pts, tris, closed)
    run('geometry.assign_representation', product=el, representation=rep)
    run('style.assign_representation_styles', shape_representation=rep, styles=[st])
    run('spatial.assign_container', products=[el], relating_structure=container)
    for pname, props in (psets or {}).items():
        ps = run('pset.add_pset', product=el, name=pname)
        run('pset.edit_pset', pset=ps, properties=props)
    return fagtag(el)

bn = {'Norm': 'Banedanmark BN1-6-7 (01.04.2023), afsnit 15.1, figur 15.1-2 og 15.1-3', 'Hastighed': f'{V} km/h (160 < V <= 200)', 'Sporafstand_fs': FS}
CUR[0] = '02-Spor'
element('IfcCourse', 'Ballast (skærver)', 'ballast', part_sub, style('Ballast', (0.55, 0.55, 0.53)), 'BALLASTBED',
        psets={'Vispecta_BN1-6-7': {**bn, 'Bsk': BSK, 'Anlaeg_a': A_BAL, 'Bt': BT}})
CUR[0] = '03-Jord'
element('IfcCourse', 'Underballast – stabilt grus (0,20 m)', 'sub1', part_sub, style('Stabilt grus', (0.80, 0.70, 0.50)), 'USERDEFINED', 'SUBBALLAST',
        psets={'Vispecta_BN1-6-7': {**bn, 'Lag': 'Øverste lag, stabilt grus', 'Tykkelse': UT1, 'Pb': PB, 'Kabelbanket': KB, 'Xp': '40 o/oo til begge sider'}})
element('IfcCourse', 'Underballast – bundsikring sand og grus (0,20 m)', 'sub2', part_sub, style('Bundsikring', (0.88, 0.80, 0.62)), 'USERDEFINED', 'SUBBALLAST',
        psets={'Vispecta_BN1-6-7': {**bn, 'Lag': 'Nederste lag, bundsikring af sand og grus', 'Tykkelse': UT2, 'Xrp': '40 o/oo til begge sider'}})
element('IfcEarthworksFill', 'Dæmning', 'emb', part_sub, style('Dæmning', (0.55, 0.45, 0.33)), 'EMBANKMENT',
        psets={'Vispecta_BN1-6-7': {**bn, 'Skraaningsanlaeg': 'Antaget 1:2'}})
st_muld = style('Muld', (0.36, 0.27, 0.18))
for side, key in (('venstre', 'muld_l'), ('højre', 'muld_r')):
    element('IfcEarthworksFill', f'Muld 0,20 m på dæmningsskråning {side}', key, part_sub, st_muld, 'SLOPEFILL',
            psets={'Vispecta_Jord': {'Materiale': 'Muld (genudlagt)', 'Tykkelse': MT, 'Note': 'Muld afrømmet under dæmningen og genudlagt på skråningerne'}})
CUR[0] = '02-Spor'
rail_style = style('Skinne 60E1', (0.35, 0.33, 0.32))
for k, part in ((1, part_t1), (2, part_t2)):
    for side, key in (('venstre', f'rail{k}l'), ('højre', f'rail{k}r')):
        element('IfcRail', f'Spor {k}, skinne {side} (60E1, langskinne)', key, part, rail_style, 'RAIL',
                psets={'Vispecta_Spor': {'Profil': '60E1 (EN 13674-1)', 'Skinnehaeldning': '1:40', 'Staalkvalitet': 'R260 (antaget)', 'Langskinnespor': True}})

# ------------------------------------------------------------------ cable troughs (BN1-13-4)
CUR[0] = '07-El-og-kabler'
ct_style = style('Kabelrende (beton)', (0.72, 0.72, 0.70))
lid_style = style('Kabelrende låg', (0.60, 0.60, 0.58))
bn13 = {'Norm': 'Banedanmark BN1-13-4 (23.07.2024), afsnit 12.7.1, tabel 12.7-1', 'Type': 'Kabelrende over jord, beton med låg',
        'Bredde': CT_W, 'Hoejde': CT_H, 'Afstand_til_naermeste_skinne': round(CT_IN - RHD / 2 - RAIL_FOOT, 3), 'Afstand_maalt_fra': 'Skinnefodens yderkant', 'Krav_afstand_skinne_V_over_120': 3.25,
        'Afstand_til_spormidte': CT_IN, 'Krav_afstand_spormidte': 2.50, 'Maks_hoejde_over_terraen': 0.20,
        'Placering': 'Uden for planumsbredden Pb (BN1-6-7) på kabelbanket, nedsat 0,15 m i stabilt grus'}
def merged(*keys):
    pts, tris = [], []
    for k in keys:
        p2, t2 = sweep(k)
        o = len(pts); pts += p2; tris += [(a + o, b + o, c + o) for a, b, c in t2]
    return pts, tris
for side, keys, d in (('venstre (ved spor 1)', ('ctl_body', 'ctl_lid'), 'left'), ('højre (ved spor 2)', ('ctr_body', 'ctr_lid'), 'right')):
    ab, al_ = keys
    el = element('IfcCableCarrierSegment', f'Kabelrende {side}, beton 360×300 mm med låg', merged(ab), part_cable, ct_style, 'CABLETRUNKINGSEGMENT',
                 psets={'Vispecta_BN1-13-4': {**bn13, 'Side': d}})
    element('IfcCableCarrierSegment', f'Kabelrende {side}, låg', merged(al_), part_cable, lid_style, 'CABLETRUNKINGSEGMENT')
ck = [sec['ct_check'] for sec in secs]
print('cable troughs: from the outer edge of the outer rails', round(ck[0][0] - (TRACKS[0] + RHD / 2 + RAIL_FOOT), 3), round((TRACKS[1] - RHD / 2 - RAIL_FOOT) - ck[0][2], 3), '| from the track centres', round(ck[0][0] - TRACKS[0], 3), round(TRACKS[1] - ck[0][2], 3),
      '| outside the planum by', round(ck[0][0] - ck[0][6], 3), round(ck[0][7] - ck[0][2], 3),
      '| highest above the banket', round(max(max(c[4], c[5]) for c in ck), 3), 'm')

# ------------------------------------------------------------------ ditches (BN1-11-1, Bilag 1.1)
CUR[0] = '04-Afvanding'
def design_bottom(ss, z0):
    """Ditch bottom: as shallow as allowed (<= z0) and falling >= FALL_MIN towards the low points of z0."""
    n = len(z0)
    lows = [i for i in range(n) if (i == 0 or z0[i] <= z0[i - 1]) and (i == n - 1 or z0[i] <= z0[i + 1])]
    zb = [None] * n
    def walk(i0, i1):   # from a high point i0 down to a low point i1
        st = 1 if i1 > i0 else -1
        zb[i0] = z0[i0] if zb[i0] is None else min(zb[i0], z0[i0])
        for i in range(i0 + st, i1 + st, st):
            v = min(z0[i], zb[i - st] - FALL_MIN * abs(ss[i] - ss[i - st]))
            zb[i] = v if zb[i] is None else min(zb[i], v)
    bounds = ([0] if lows[0] != 0 else []) + lows + ([n - 1] if lows[-1] != n - 1 else [])
    for a, b in zip(bounds, bounds[1:]):
        if a in lows and b in lows:
            h = max(range(a, b + 1), key=lambda i: z0[i]); walk(h, a); walk(h, b)
        elif a in lows: walk(b, a)      # the end b is a high point
        else: walk(a, b)                # the start a is a high point
    return zb, [i for i in lows if 0 < i < n - 1]

ditch = {}
for side, key, sg in (('left', 'toe_l', 1), ('right', 'toe_r', -1)):
    v1 = [sec[key][0] + sg * GB for sec in secs]
    zt = [terrain_at(s, v) for s, v in zip(stations, v1)]
    zb, lows = design_bottom(stations, [z - D_DITCH for z in zt])
    profs = []
    for s, a, ztop, b in zip(stations, v1, zt, zb):
        zt0, k = terrain_at(s, 0.0), terrain_at(s, 1.0) - terrain_at(s, 0.0)
        vib = a + sg * A_DITCH * (ztop - b)
        vob = vib + sg * B_DITCH
        vot = (zt0 - b + sg * vob / A_DITCH) / (sg / A_DITCH - k)
        profs.append([(a, ztop), (vib, b), (vob, b), (vot, zt0 + k * vot)])
    ditch[side] = {'prof': profs, 'zb': zb, 'lows': lows, 'depth': [z - b for z, b in zip(zt, zb)]}
    falls = [abs(zb[i + 1] - zb[i]) / (stations[i + 1] - stations[i]) for i in range(len(zb) - 1)]
    print(f'ditch {side}: depth {min(ditch[side]["depth"]):.3f}–{max(ditch[side]["depth"]):.3f} m, smallest fall {min(falls) * 1000:.2f} permille, '
          f'low points (wells) at', [round(START_STATION + stations[i]) for i in lows])

dstyle = style('Grøft (udgravning)', (0.45, 0.62, 0.78))
bn11 = {'Norm': 'Banedanmark BN1-11-1 (01.10.2006), afsnit 12.1 og Bilag 1.1 (nyanlæg i påfyldning)', 'Bundbredde_min': B_DITCH,
        'Dybde_min': D_DITCH, 'Skraaningsanlaeg': '1:1,5', 'Laengdefald_min': '2 o/oo', 'Groeftebanket': GB,
        'Afloeb': 'Brønd min. ø300 mm med sandfang og halvkugleformet rist i lavpunkter'}
cut_els = []
for side, name in (('left', 'Banegrøft venstre'), ('right', 'Banegrøft højre')):
    d = ditch[side]
    pts, tris = [], []
    for fr, pr in zip(frames, d['prof']):
        for v, z in pr: pts.append(world(fr, v, z))
    n = 4
    for i in range(len(stations) - 1):
        a0, b0 = i * n, (i + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            tris += [(a0 + j, b0 + j, b0 + j2), (a0 + j, b0 + j2, a0 + j2)]
    last = (len(stations) - 1) * n
    ends = [(0, 1, 2), (0, 2, 3)]
    for a, b, c in ends: tris.append((c, b, a)); tris.append((last + a, last + b, last + c))
    # the solid's orientation does not matter for viewing; IfcEarthworksCut is the excavated volume
    falls = [abs(d['zb'][i + 1] - d['zb'][i]) / (stations[i + 1] - stations[i]) for i in range(len(stations) - 1)]
    el = cut_els.append(None) or element('IfcEarthworksElement', f'{name} (bund 0,35 m, anlæg 1:1,5)', (pts, tris), part_drain, dstyle, None, 'BANEGRØFT',
                 psets={'Vispecta_BN1-11-1': {**bn11, 'Dybde_min_model': round(min(d['depth']), 3), 'Dybde_max_model': round(max(d['depth']), 3),
                                              'Laengdefald_min_model_promille': round(min(falls) * 1000, 2), 'Antal_broende': len(d['lows'])}})
    cut_els[-1] = el
    # outlet wells at the low points
    wstyle = style('Brønd (PE/beton)', (0.30, 0.30, 0.32))
    sgn = 1 if side == 'left' else -1
    for i in d['lows']:
        if abs(stations[i] - STREAM[0]) < 12:
            continue                                   # the ditch runs into the stream here (lined outlet below)
        fr, pr = frames[i], d['prof'][i]
        vc, zc = (pr[1][0] + pr[2][0]) / 2, pr[1][1]
        px, py = world(fr, vc, 0)[:2]
        m = 16
        ring = [(px + WELL_D / 2 * math.cos(2 * math.pi * k / m), py + WELL_D / 2 * math.sin(2 * math.pi * k / m)) for k in range(m)]
        wp = [(x, y, zc) for x, y in ring] + [(x, y, zc - WELL_H) for x, y in ring]
        wt = []
        for k in range(m):
            k2 = (k + 1) % m
            wt += [(k, k + m, k2 + m), (k, k2 + m, k2)]
        for k in range(1, m - 1): wt += [(0, k, k + 1), (m, m + k + 1, m + k)]
        element('IfcDistributionChamberElement', f'Brønd {name.split()[-1]} st. {START_STATION + stations[i]:.0f} (ø315 med sandfang)', (wp, wt), part_drain, wstyle, 'SUMP',
                psets={'Vispecta_BN1-11-1': {'Norm': 'Banedanmark BN1-11-1, afsnit 12.1', 'Indvendig_diameter_mm': 315, 'Sandfang': True,
                                             'Rist': 'Halvkugleformet opadhvælvet, ribbeafstand 25–50 mm', 'Station': round(START_STATION + stations[i], 1)}})
        # outlet pipe (PVC ø200) from the well, 12 m out at right angles with a fall of 5 permille, to the recipient (field drain)
        z_in = zc - WELL_H + 0.25
        v_end = pr[3][0] + sgn * 12.0
        L_ = abs(v_end - vc)
        element('IfcPipeSegment', f'Afløbsledning ø200 fra brønd st. {START_STATION + stations[i]:.0f} til recipient', cyl(w3(fr, vc, 0, z_in), w3(fr, v_end, 0, z_in - 0.005 * L_), 0.1, 10),
                part_drain, style('Afløbsledning (PVC)', (0.72, 0.40, 0.22)), 'RIGIDSEGMENT',
                psets={'Vispecta_BN1-11-1': {'Dimension': 'PVC ø200', 'Fald': '5 o/oo', 'Udloeb': 'Recipient (markdræn), uden for modellen'}})
    # lining where the ditch runs into the stream: concrete slabs 500 x 500 x 50 on 100 mm cement-bound gravel (BN1-11-1, 12.1)
    idx = [k for k, x in enumerate(stations) if BR_S0 <= x <= BR_S1]
    def lining(pr, t):
        top = pr
        bot = [(v, z - t) for v, z in top]
        return top + bot[::-1]
    sts_ = [stations[k] for k in idx]; frs_ = [frames[k] for k in idx]
    element('IfcCovering', f'{name}: udløb til vandløb, beklædning med betonfliser', gloft('p', sts_, frs_, [{'p': lining(d['prof'][k], 0.15)} for k in idx]),
            part_drain, style('Betonfliser', (0.70, 0.70, 0.68)), 'CLADDING',
            psets={'Vispecta_BN1-11-1': {'Norm': 'BN1-11-1 afsnit 12.1 (større tilløb: grøftesider og bund beklædes)', 'Fliser': '500 x 500 x 50 mm',
                                         'Underlag': '100 mm cementstabiliseret grus'}})

# ------------------------------------------------------------------ terrain with the ditches cut in
CUR[0] = '08-Terraen'
vs = [VR + i * 5.0 - 55.0 for i in range(23)]
L_in = min(p[0][0] for p in ditch['left']['prof']); L_out = max(p[3][0] for p in ditch['left']['prof'])
R_in = max(p[0][0] for p in ditch['right']['prof']); R_out = min(p[3][0] for p in ditch['right']['prof'])
far_l = [v for v in sorted(vs, reverse=True) if v > L_out + 0.5]
mid = [v for v in sorted(vs, reverse=True) if R_in + 0.5 < v < L_in - 0.5]
far_r = [v for v in sorted(vs, reverse=True) if v < R_out - 0.5]
tp, tt = [], []
for k, (fr, s) in enumerate(zip(frames, stations)):
    row = [(v, terrain_at(s, v)) for v in far_l] + ditch['left']['prof'][k][::-1] + [(v, terrain_at(s, v)) for v in mid] \
        + ditch['right']['prof'][k] + [(v, terrain_at(s, v)) for v in far_r]
    for v, z in row: tp.append(world(fr, v, z))
nv = len(far_l) + len(mid) + len(far_r) + 8
for r in range(len(stations) - 1):
    for c in range(nv - 1):
        a0, b0 = r * nv + c, (r + 1) * nv + c
        tt += [(a0, a0 + 1, b0 + 1), (a0, b0 + 1, b0)]
terrain = element('IfcGeographicElement', 'Terræn (med grøfter)', (tp, tt), site, style('Terræn', (0.55, 0.68, 0.45)), 'TERRAIN', closed=False)
# the ditches are excavations in the terrain (IfcEarthworksCut voids the terrain); the terrain surface already has them cut in



# ------------------------------------------------------------------ overhead contact line (Sicat SX)
CUR[0] = '06-Koereledning'
# Sources: BN1-214-3 KI-Sicat (04.02.2026): Sicat SX, 25 kV 50 Hz with AT supply; components mast,
# K-ophæng, bæretov, køretråd, isolators (Bilag 1.1). BN1-6-7 note 1 to figure 15.1-3: mast foundations
# >= 2.70 m from the track centre. BN1-13-4 12.7.1: the cable trough stays clear (4.10 m).
# Assumed (FKI/BN1-105/106 and the Sicat SX design rules are not public): contact wire height 5.50 m
# above SO, system height 1.60 m, stagger +-0.20 m plus the half versine in curves, spans of about
# 60 m, mast face 3.30 m from the track centre, HE 260 B mast, precast concrete foundation 0.90 x 4.0 m.
CW_H, SYS_H, STAG, SPAN_MAX = 5.50, 1.60, 0.20, 60.0
MAST_FACE, MAST_B, MAST_TOP = 3.30, 0.26, 0.85          # mast face from the track centre, HE 260 B, top above the messenger
FND_D, FND_L, FND_UP = 0.90, 4.00, 0.15                 # foundation diameter, length, top above the banket
SAG, DROP_FIRST, DROP_MAX = 0.65, 4.5, 6.5              # messenger sag at midspan, first dropper, dropper spacing
R_CW, R_MW, R_DR, R_TUBE, R_INS = 0.006, 0.007, 0.0025, 0.030, 0.060

def track_pt(s, c, u, d):
    """Point in the section at s: track centre c (lateral), u along the SO plane (right +), d below it."""
    z_low = height(s); D = cant(s); t = math.asin(D / RHD)
    e = (-math.cos(t), math.sin(t)); nrm = (math.sin(t), math.cos(t))
    C = (c + RHD / 2 + e[0] * RHD / 2, z_low + e[1] * RHD / 2)
    return (C[0] + e[0] * u - nrm[0] * d, C[1] + e[1] * u - nrm[1] * d)

def curvature(s):
    acc = 0.0
    for kind, L, r0, r1 in segs1:
        if s <= acc + L + 1e-9:
            x = s - acc
            return curv(r0) + (curv(r1) - curv(r0)) * x / L
        acc += L
    return 0.0

def w3(fr, v, a, z):   # section frame -> world, a along the track
    px, py, tx, ty = fr
    return (px - ty * v + tx * a, py + tx * v + ty * a, z)

def cyl(p0, p1, r, n=8):
    """Closed cylinder between two 3D points."""
    ax = [p1[i] - p0[i] for i in range(3)]; L = math.sqrt(sum(x * x for x in ax)) or 1e-9
    ax = [x / L for x in ax]
    ref = (0, 0, 1) if abs(ax[2]) < 0.9 else (1, 0, 0)
    u = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]
    lu = math.sqrt(sum(x * x for x in u)); u = [x / lu for x in u]
    w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]]
    pts = []
    for p in (p0, p1):
        for k in range(n):
            a = 2 * math.pi * k / n
            pts.append(tuple(p[i] + r * (math.cos(a) * u[i] + math.sin(a) * w[i]) for i in range(3)))
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        tris += [(k, k2, k2 + n), (k, k2 + n, k + n)]
    for k in range(1, n - 1): tris += [(0, k + 1, k), (n, n + k, n + k + 1)]
    return pts, tris

def merge(*meshes):
    P, T = [], []
    for p, t in meshes:
        o = len(P); P += list(p); T += [(a + o, b + o, c + o) for a, b, c in t]
    return P, T

def prism(poly, z0, z1, fr, v0, a0=0.0):
    """Vertical prism of a plan polygon (v, a offsets) from z0 to z1 at (v0, a0) in the section frame."""
    n = len(poly)
    pts = [w3(fr, v0 + v, a0 + a, z0) for v, a in poly] + [w3(fr, v0 + v, a0 + a, z1) for v, a in poly]
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        tris += [(k, k2, k2 + n), (k, k2 + n, k + n)]
    for a, b, c in ear_clip(poly): tris += [(c, b, a), (a + n, b + n, c + n)]
    return pts, tris

def hprofile(b, tf=0.0175, tw=0.010):
    h = b / 2
    return [(-h, -h), (h, -h), (h, -h + tf), (tw / 2, -h + tf), (tw / 2, h - tf), (h, h - tf), (h, h), (-h, h), (-h, h - tf), (-tw / 2, h - tf), (-tw / 2, -h + tf), (-h, -h + tf)]

nsp = max(1, math.ceil(TOTAL1 / SPAN_MAX)); SPAN = TOTAL1 / nsp
mast_s = [i * SPAN for i in range(nsp + 1)]
st_fnd = style('Mastefundament (beton)', (0.70, 0.70, 0.68))
st_mast = style('Mast (stål, brun)', (0.42, 0.24, 0.15))
st_tube = style('K-ophæng (aluminium)', (0.78, 0.80, 0.82))
st_ins = style('Isolator', (0.55, 0.36, 0.25))
st_wire = style('Køreledning (Cu)', (0.72, 0.45, 0.20))
ocs_ps = {'System': 'Siemens Sicat SX, 25 kV 50 Hz (AT-forsyning)', 'Kilde': 'BN1-214-3 KI-Sicat (04.02.2026), Bilag 1.1; BN1-6-7 note 1 til figur 15.1-3',
          'Antaget': 'Køretrådshøjde 5,50 m, systemhøjde 1,60 m, siksak ±0,20 m + halv pilhøjde i kurver, spænd ca. 60 m (FKI/BN1-105/106 ikke offentlige)'}

def place(el, parts):
    run('aggregate.assign_object', relating_object=el, products=parts)

tracks = [(0, TRACKS[0], 1), (1, TRACKS[1], -1)]   # index, track centre, side of the masts (+1 left, -1 right)
supports = {0: [], 1: []}
checks = {'face': [], 'trough_gap': [], 'ballast_gap': []}
for i, s in enumerate(mast_s):
    fr = frame(basis1, s)
    kap = curvature(s)
    for k, c, side in tracks:
        alt = 1 if (i + k) % 2 == 0 else -1
        e_left = alt * STAG - kap * SPAN * SPAN / 16.0        # lateral position of the contact wire (left +)
        C = track_pt(s, c, -e_left, -CW_H)                   # contact wire at the support
        M = track_pt(s, c, -e_left, -(CW_H + SYS_H))         # messenger at the support
        supports[k].append((s, fr, C, M))
        # mast and foundation on the outer side of the track
        vm = c + side * (MAST_FACE + MAST_B / 2)
        sec = section(s, lambda v, s=s: terrain_at(s, v))
        # planum height: from sub1 polygon top edge (VR point is index of (VR, zp(VR)))
        vr_pt = [p for p in sec['sub1'] if abs(p[0] - VR) < 1e-9][0]
        z_ban = vr_pt[1] - XP * abs(vm - VR)
        # top of the foundation just above the ballast shoulder (sleeper top), at least FND_UP above the banket;
        # the ballast slope may be vertical against a mast foundation >= 2.70 m from the track centre (BN1-6-7 note 1)
        z_sl = track_pt(s, c, 0.0, RAIL_H + PAD)[1]
        z_ft = max(z_ban + FND_UP, z_sl + 0.05)
        fnd = prism([(FND_D / 2 * math.cos(2 * math.pi * q / 16), FND_D / 2 * math.sin(2 * math.pi * q / 16)) for q in range(16)], z_ft - FND_L, z_ft, fr, vm)
        z_top = M[1] + MAST_TOP
        mast = merge(prism(hprofile(MAST_B), z_ft + 0.04, z_top, fr, vm), prism([(-0.25, -0.25), (0.25, -0.25), (0.25, 0.25), (-0.25, 0.25)], z_ft, z_ft + 0.04, fr, vm))
        checks['face'].append(abs(vm - c) - MAST_B / 2)
        checks['trough_gap'].append(abs(c + side * (RHD / 2 + RAIL_FOOT + CT_RAIL) - c) and (CT_IN - (abs(vm - c) + FND_D / 2)))
        checks['ballast_gap'].append(abs(vm - c) - FND_D / 2)   # foundation face from the track centre (>= 2.70 m)
        tag = f'{START_STATION + s:.0f}'
        name = f'Spor {k + 1} st. {tag}'
        a_mast = run('root.create_entity', ifc_class='IfcElementAssembly', name=f'Mast {name}', predefined_type='MAST')
        run('geometry.edit_object_placement', product=a_mast)
        run('spatial.assign_container', products=[a_mast], relating_structure=part_ocs); fagtag(a_mast)
        f_el = element('IfcFooting', f'Mastefundament {name} (ø{FND_D * 1000:.0f} × {FND_L:.1f} m)', fnd, part_ocs, st_fnd, 'USERDEFINED', 'MASTFUNDAMENT',
                       psets={'Vispecta_Koereledning': {**ocs_ps, 'Station': round(START_STATION + s, 1), 'Spor': k + 1}})
        m_el = element('IfcColumn', f'Mast {name} (HE 260 B)', mast, part_ocs, st_mast, 'USERDEFINED', 'MAST',
                       psets={'Vispecta_Koereledning': {**ocs_ps, 'Station': round(START_STATION + s, 1), 'Spor': k + 1,
                                                        'Afstand_mastflade_spormidte': MAST_FACE, 'Hoejde_over_fundament': round(z_top - z_ft, 3)}})
        place(a_mast, [f_el, m_el])
        # K-ophæng: bærerør (top) to the messenger, stagrør (diagonal) from low on the mast, hængerør and styrearm to the contact wire
        vf = vm - side * MAST_B / 2                       # mast face towards the track
        ztop_att = M[1] + 0.25; zbot_att = C[1] + 0.35
        tw = side * -1                                    # direction from the mast towards the track
        m_end = (M[0] + tw * 0.30, M[1] - 0.03)          # the tube goes a little beyond the messenger
        st_end = (M[0] - tw * 0.60, M[1] + (ztop_att - M[1]) * 0.60 / max(0.1, abs(M[0] - vf)) )
        p = lambda v, z: w3(fr, v, 0.0, z)
        ins1_a, ins1_b = p(vf + tw * 0.15, ztop_att - 0.01), p(vf + tw * 0.75, ztop_att - (ztop_att - M[1]) * 0.6 / max(0.1, abs(M[0] - vf)))
        ins2_t = 0.60 / math.hypot(st_end[0] - vf, st_end[1] - zbot_att)
        ins2_a = p(vf + tw * 0.15 * (abs(st_end[0] - vf) / math.hypot(st_end[0] - vf, st_end[1] - zbot_att)), zbot_att)
        ins2_b = p(vf + (st_end[0] - vf) * ins2_t + tw * 0.0, zbot_att + (st_end[1] - zbot_att) * ins2_t)
        top_tube = cyl(ins1_b, p(*m_end), R_TUBE)
        stag = cyl(ins2_b, p(*st_end), R_TUBE * 0.9)
        # steady arm: from a point 1.10 m towards the mast, 0.12 m above the contact wire, to the contact wire
        sa_root = (C[0] - tw * 1.10, C[1] + 0.12)
        frac = (sa_root[0] - vf) / (st_end[0] - vf)
        z_stag = zbot_att + (st_end[1] - zbot_att) * frac
        hanger = cyl(p(sa_root[0], sa_root[1]), p(sa_root[0], z_stag), R_TUBE * 0.6)
        arm = cyl(p(*sa_root), p(C[0], C[1]), R_TUBE * 0.5)
        hook = cyl(p(M[0], M[1] - 0.02), p(M[0], M[1] + 0.06), R_TUBE * 0.5)
        a_k = run('root.create_entity', ifc_class='IfcElementAssembly', name=f'K-ophæng {name}', predefined_type='SUPPORTINGASSEMBLY')
        run('geometry.edit_object_placement', product=a_k)
        run('spatial.assign_container', products=[a_k], relating_structure=part_ocs); fagtag(a_k)
        parts = [
            element('IfcMember', f'Bærerør {name}', merge(top_tube, hook), part_ocs, st_tube, 'MEMBER'),
            element('IfcMember', f'Stagrør {name}', merge(stag, hanger), part_ocs, st_tube, 'STRUT'),
            element('IfcMember', f'Styrearm {name}', arm, part_ocs, st_tube, 'MEMBER',
                    psets={'Vispecta_Koereledning': {'Siksak_venstre_positiv': round(e_left, 3), 'Koeretraadshoejde_over_SO': CW_H}}),
            element('IfcDiscreteAccessory', f'Isolator bærerør {name}', cyl(ins1_a, ins1_b, R_INS, 10), part_ocs, st_ins, 'INSULATOR'),
            element('IfcDiscreteAccessory', f'Isolator stagrør {name}', cyl(ins2_a, ins2_b, R_INS, 10), part_ocs, st_ins, 'INSULATOR'),
        ]
        place(a_k, parts)

# wires per span: contact wire (straight), messenger (parabola), droppers
dev = []
for k, c, side in tracks:
    sp = supports[k]
    for (s0, fr0, C0, M0), (s1, fr1, C1, M1) in zip(sp, sp[1:]):
        c0, c1 = w3(fr0, C0[0], 0, C0[1]), w3(fr1, C1[0], 0, C1[1])
        m0, m1 = w3(fr0, M0[0], 0, M0[1]), w3(fr1, M1[0], 0, M1[1])
        lerp = lambda a, b, t: tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
        msg = lambda t: (lambda q: (q[0], q[1], q[2] - 4 * SAG * t * (1 - t)))(lerp(m0, m1, t))
        mpts = [msg(q / 12) for q in range(13)]
        mw = merge(*[cyl(a, b, R_MW, 6) for a, b in zip(mpts, mpts[1:])])
        L = math.dist(c0[:2], c1[:2])
        nd = max(1, math.ceil((L - 2 * DROP_FIRST) / DROP_MAX))
        ts = [(DROP_FIRST + (L - 2 * DROP_FIRST) * q / nd) / L for q in range(nd + 1)]
        drops = merge(*[cyl(lerp(c0, c1, t), msg(t), R_DR, 5) for t in ts])
        tag = f'Spor {k + 1} st. {START_STATION + s0:.0f}–{START_STATION + s1:.0f}'
        element('IfcCableSegment', f'Køretråd {tag} (AC-120 CuAg)', cyl(c0, c1, R_CW, 6), part_ocs, st_wire, 'CONTACTWIRESEGMENT')
        element('IfcCableCarrierSegment', f'Bæretov {tag} (Bz II 70)', mw, part_ocs, st_wire, 'CATENARYWIRE')
        element('IfcCableCarrierSegment', f'Hængere {tag} ({len(ts)} stk.)', drops, part_ocs, st_wire, 'DROPPER')
        # lateral deviation of the contact wire from the track centre along the span (plan)
        for q in range(11):
            t = q / 10; sm = s0 + (s1 - s0) * t
            px, py, tx, ty = frame(basis1, sm)
            ax = track_pt(sm, c, 0.0, -CW_H)          # the pantograph axis at contact wire height (tilted with the cant)
            cx, cy = px - ty * ax[0], py + tx * ax[0]
            P = lerp(c0, c1, t)
            dev.append(abs((P[0] - cx) * (-ty) + (P[1] - cy) * tx))
print(f'OCS: {len(mast_s)} masts per track, span {SPAN:.2f} m, contact wire up to {max(dev):.3f} m from the track centre,'
      f' mast face {min(checks["face"]):.2f} m from the track centre, gap foundation-trough {min(checks["trough_gap"]):.2f} m,'
      f' foundation face {min(checks["ballast_gap"]):.2f} m from the track centre (>= 2.70)')



# ------------------------------------------------------------------ railway bridge (BN1-59-5, 11.2)
CUR[0] = '05-Bro'
# A 20 m concrete slab bridge on two abutment walls over a stream. Cross section without ballast
# walls (V = 180 > 160 km/h, note 11.2.1-5): inside of the railings >= 4.00 m from each track centre
# (free width 4.00 + 4.50 + 4.00 = 12.50 m), service passage 0.80 m on the edge beams, edge upstand
# 0.55 m above the protection concrete (h 300 + dh 200 on an electrified line + 50 tolerance), inner
# face of the upstand 1:5 and >= 2.20 m from the track centre (ballast cleaning machine), SO to top of
# deck >= 0.75 m + 0.05 m tolerance under every rail, continuous ballast (Bt >= 0.35 m, BN1-6-7) and
# >= 100 mm ballast over the whole deck, cross fall 25 permille to both sides, counter fall 110
# permille at the edge beams, longitudinal fall 10 permille. Waterproofing and protection concrete
# are part of the slab here. The cables go in the edge beams (not modelled) - the troughs stop.
vl_kb, vr_kb = TRACKS[0] + BR_KB_IN, TRACKS[1] - BR_KB_IN        # inner feet of the edge beams
vl_rail, vr_rail = TRACKS[0] + BR_FREE, TRACKS[1] - BR_FREE      # inside of the railings (ballast screen)
vl_out, vr_out = vl_rail + BR_OUT, vr_rail - BR_OUT
GUT = 0.30                                                        # gutter width with the counter fall
rails_v = [c + sg * RHD / 2 for c in TRACKS for sg in (-1, 1)]
def deck_top_vr(s):
    """Top of the deck at VR: as high as the clearance under the rails allows at the high end, 10 permille fall."""
    s_hi = BR_S1                                  # the deck rises 10 permille along the line, the track 5 permille: tightest at the far end
    zr = min(track_pt(s_hi, c, sg * RHD / 2, 0.0)[1] - BR_SO_DECK + BR_XF * abs(c + sg * RHD / 2 - VR) for c in TRACKS for sg in (-1, 1))
    return zr + BR_LF * (s - s_hi)
def deck_z(s, v):
    z0 = deck_top_vr(s) - BR_XF * abs(v - VR)
    # counter fall: the last GUT before the edge beam rises 110 permille
    for vk, sg in ((vl_kb, 1), (vr_kb, -1)):
        d = sg * (v - (vk - sg * GUT))
        if d > 0: z0 = deck_top_vr(s) - BR_XF * abs((vk - sg * GUT) - VR) + BR_CF * d - BR_XF * 0
    return z0
def br_section(s):
    """Deck slab, edge beams and ballast in the section at s."""
    zl_g, zr_g = deck_z(s, vl_kb - GUT), deck_z(s, vr_kb + GUT)
    zl_kb, zr_kb = deck_z(s, vl_kb), deck_z(s, vr_kb)
    z_vr = deck_z(s, VR)
    kt_l, kt_r = zl_kb + BR_KANT, zr_kb + BR_KANT                 # top of the edge beams
    soffit = z_vr - BR_SLAB
    LAY, TOP_T = 0.075, 0.070                                     # 5 mm waterproofing + 70 mm protection concrete on the slab
    deck_top = [(vl_kb, zl_kb), (vl_kb - GUT, zl_g), (VR, z_vr), (vr_kb + GUT, zr_g), (vr_kb, zr_kb)]
    topping = deck_top + [(v, z - TOP_T) for v, z in reversed(deck_top)]
    membrane = [(v, z - TOP_T) for v, z in deck_top] + [(v, z - LAY) for v, z in reversed(deck_top)]
    slab = [(vl_out, kt_l - 0.35), (vl_kb, zl_kb - LAY), (vl_kb - GUT, zl_g - LAY), (VR, z_vr - LAY), (vr_kb + GUT, zr_g - LAY), (vr_kb, zr_kb - LAY), (vr_out, kt_r - 0.35),
            (vr_out, kt_r - 0.85), (vr_kb + 0.6, soffit), (vl_kb - 0.6, soffit), (vl_out, kt_l - 0.85)][::-1]
    kb_l = [(vl_kb, zl_kb - LAY), (vl_out, kt_l - 0.35), (vl_out, kt_l), (vl_kb + BR_KANT / 5, kt_l), (vl_kb, zl_kb)]
    kb_r = [(vr_kb, zr_kb - LAY), (vr_kb, zr_kb), (vr_kb - BR_KANT / 5, kt_r), (vr_out, kt_r), (vr_out, kt_r - 0.35)]
    # ballast: the track ballast down to a 100 mm layer that covers the deck between the edge beams
    sec = section(s, lambda v, s=s: terrain_at(s, v))
    top = sec['ballast'][:5]                                     # o_l, i_1, vee, i_2, o_r
    def toe(pt, side):   # slope 1:1.5 from pt down to the 100 mm layer on the deck (falling BR_XF outwards)
        sg = 1 if side > 0 else -1
        a0 = z_vr + 0.10
        vv = (pt[1] + side * pt[0] / A_BAL - a0 - BR_XF * sg * VR) / (side / A_BAL - BR_XF * sg)
        return (vv, a0 - BR_XF * abs(vv - VR))
    tl, tr = toe(top[0], 1), toe(top[4], -1)
    bal = top + [tr, (vr_kb + GUT, zr_g + 0.10), (vr_kb - 0.02, zr_kb + 0.10), (vr_kb, zr_kb), (vr_kb + GUT, zr_g), (VR, z_vr),
                 (vl_kb - GUT, zl_g), (vl_kb, zl_kb), (vl_kb + 0.02, zl_kb + 0.10), (vl_kb - GUT, zl_g + 0.10), tl]
    return {'slab': slab, 'kb_l': kb_l, 'kb_r': kb_r, 'bal': bal, 'topping': topping, 'membrane': membrane, 'soffit': soffit, 'kt': (kt_l, kt_r), 'sec': sec}

br_st = [BR_S0 + i * 1.0 for i in range(int(BR_S1 - BR_S0) + 1)]
br_fr = [frame(basis1, x) for x in br_st]
br_secs = [br_section(x) for x in br_st]
def loft(key, sts=br_st, frs=br_fr, secs_=br_secs):
    pts, tris = [], []
    n = len(secs_[0][key])
    for fr, sc in zip(frs, secs_):
        for v, z in sc[key]: pts.append(world(fr, v, z))
    for i in range(len(sts) - 1):
        a0, b0 = i * n, (i + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            tris += [(a0 + j, b0 + j, b0 + j2), (a0 + j, b0 + j2, a0 + j2)]
    last = (len(sts) - 1) * n
    for a, b, c in ear_clip(secs_[0][key]): tris.append((c, b, a))
    for a, b, c in ear_clip(secs_[-1][key]): tris.append((last + a, last + b, last + c))
    return pts, tris

bridge_fac = run('root.create_entity', ifc_class='IfcBridge', name='Jernbanebro over vandløb, st. 12+195–12+215', predefined_type='SLAB_BRIDGE')
br_super = run('root.create_entity', ifc_class='IfcBridgePart', name='Overbygning (brodæk)', predefined_type='SUPERSTRUCTURE')
br_sub = run('root.create_entity', ifc_class='IfcBridgePart', name='Underbygning (landfæster)', predefined_type='SUBSTRUCTURE')
for bp_ in (br_super, br_sub): bp_.UsageType = 'LONGITUDINAL'
run('aggregate.assign_object', relating_object=site, products=[bridge_fac])
run('aggregate.assign_object', relating_object=bridge_fac, products=[br_super, br_sub])
for p_ in (bridge_fac, br_super, br_sub): run('geometry.edit_object_placement', product=p_)
bn59 = {'Norm': 'Banedanmark BN1-59-5 (20.11.2024), afsnit 11.2', 'Fri_bredde': round(vl_rail - vr_rail, 3), 'Krav_fri_bredde': 4.0 + FS + 4.0,
        'Afstand_CL_spor_inderside_raekvaerk': BR_FREE, 'Servicepassage': BR_PASS, 'Kantopspring': BR_KANT, 'Krav_kantopspring': '300 + 200 mm (+ tolerance)',
        'SO_til_overside_daek_min': BR_SO_DECK, 'Tvaerfald': '25 o/oo', 'Laengdefald': '10 o/oo', 'Kontrafald': '110 o/oo'}
st_con = style('Beton (bro)', (0.74, 0.74, 0.72))
element('IfcSlab', 'Brodæk (betonplade, 20 m)', loft('slab'), br_super, st_con, 'USERDEFINED', 'BRIDGEDECK', psets={'Vispecta_BN1-59-5': bn59})
element('IfcCovering', 'Beskyttelsesbeton (70 mm)', loft('topping'), br_super, style('Beskyttelsesbeton', (0.80, 0.80, 0.78)), 'TOPPING')
element('IfcCovering', 'Fugtisolering (5 mm, svejset bitumenmembran)', loft('membrane'), br_super, style('Fugtisolering', (0.10, 0.10, 0.12)), 'MEMBRANE')
element('IfcBeam', 'Kantbjælke venstre', loft('kb_l'), br_super, st_con, 'EDGEBEAM')
element('IfcBeam', 'Kantbjælke højre', loft('kb_r'), br_super, st_con, 'EDGEBEAM')
CUR[0] = '02-Spor'
element('IfcCourse', 'Ballast på bro (gennemgående, min. 100 mm over dækket)', loft('bal'), part_sub, style('Ballast', (0.55, 0.55, 0.53)), 'BALLASTBED',
        psets={'Vispecta_BN1-59-5': {'Norm': 'BN1-59-5 11.2.2 og BN1-6-7', 'Bt_min': BT}})
CUR[0] = '05-Bro'
# abutment walls: under the deck ends, across the whole embankment, from 1 m below the stream banks
def abutment(s0, s1):
    sc = section(s0, lambda v, s=s0: terrain_at(s0, v)); bs = br_section(s0)
    toe_l, toe_r = sc['toe_l'], sc['toe_r']
    sub1 = sc['sub1']; outer_l, outer_r = sub1[0], [p for p in sub1 if abs(p[0] - (TRACKS[1] - PB - KB)) < 1e-6][0]
    zb = min(terrain_at(s0, toe_l[0]), terrain_at(s0, toe_r[0]), terrain_at(s1, 0.0)) - 1.0
    BRG = 0.06
    wing_l = [(toe_l[0], zb), (toe_l[0], toe_l[1]), (outer_l[0], outer_l[1]), (vl_out, outer_l[1] - XP * (outer_l[0] - vl_out)), (vl_out, zb)]
    wall = [(vl_out, zb), (vl_out, bs['soffit'] - BRG), (vr_out, bs['soffit'] - BRG), (vr_out, zb)]
    wing_r = [(vr_out, zb), (vr_out, outer_r[1] - XP * (vr_out - outer_r[0])), (outer_r[0], outer_r[1]), (toe_r[0], toe_r[1]), (toe_r[0], zb)]
    return {'w': wall, 'wl': wing_l, 'wr': wing_r, 'soffit': bs['soffit']}
for nm, a, b in (('Landfæste nord (st. 12+195)', BR_S0, BR_S0 + BR_WALL), ('Landfæste syd (st. 12+215)', BR_S1 - BR_WALL, BR_S1)):
    pa, pb = abutment(a, a), abutment(b, b)
    sts, frs = [a, b], [frame(basis1, a), frame(basis1, b)]
    sc_ = [pa, pb]
    element('IfcWall', nm, loft('w', sts, frs, sc_), br_sub, st_con, 'RETAININGWALL')
    element('IfcWall', nm.replace('Landfæste', 'Fløjvæg venstre,'), loft('wl', sts, frs, sc_), br_sub, st_con, 'RETAININGWALL')
    element('IfcWall', nm.replace('Landfæste', 'Fløjvæg højre,'), loft('wr', sts, frs, sc_), br_sub, st_con, 'RETAININGWALL')
    sm = (a + b) / 2; frm = frame(basis1, sm); zs = br_section(sm)['soffit']
    for vb in (2.0, -1.0, -3.5, -6.5):   # elastomeric bearings 400 x 300 x 60 mm under the slab
        element('IfcBearing', f'Leje {nm.split()[1]} v = {vb:+.1f} m (elastomer 400×300×60)',
                prism([(-0.20, -0.15), (0.20, -0.15), (0.20, 0.15), (-0.20, 0.15)], zs - 0.06, zs, frm, vb), br_sub,
                style('Leje (elastomer)', (0.15, 0.15, 0.15)), 'ELASTOMERIC')
# railings with ballast screens
st_steel = style('Rækværk (stål, galvaniseret)', (0.62, 0.64, 0.66))
for nm, vr_, side, ktk in (('venstre', vl_rail, 1, 0), ('højre', vr_rail, -1, 1)):
    parts = []
    vpost = vr_ + side * 0.06
    for i, x in enumerate(br_st[::2]):
        fr = frame(basis1, x); kt = br_section(x)['kt'][ktk]
        parts.append(prism([(-0.05, -0.05), (0.05, -0.05), (0.05, 0.05), (-0.05, 0.05)], kt, kt + 1.20, fr, vpost))
    p0, p1 = frame(basis1, BR_S0), frame(basis1, BR_S1)
    k0, k1 = br_section(BR_S0)['kt'][ktk], br_section(BR_S1)['kt'][ktk]
    for hh in (1.20, 0.60):
        parts.append(cyl(w3(p0, vpost, 0, k0 + hh), w3(p1, vpost, 0, k1 + hh), 0.03, 8))
    rail_el = element('IfcRailing', f'Rækværk {nm} (h = 1,20 m)', merge(*parts), br_super, st_steel, 'GUARDRAIL')
    # ballast screen: a plate at the foot of the railing, inside face at 4.00 m from the track centre
    sc_ = [{'p': [(vr_, k0), (vr_ + side * 0.01, k0), (vr_ + side * 0.01, k0 + 0.30), (vr_, k0 + 0.30)][::side]}, {'p': [(vr_, k1), (vr_ + side * 0.01, k1), (vr_ + side * 0.01, k1 + 0.30), (vr_, k1 + 0.30)][::side]}]
    element('IfcPlate', f'Ballastskærm {nm}', loft('p', [BR_S0, BR_S1], [p0, p1], sc_), br_super, st_steel, 'USERDEFINED', 'BALLASTSKAERM')
# checks
bt_min = min(track_pt(x, c, sg * RHD / 2, RAIL_H + PAD + SL_H)[1] - deck_z(x, c + sg * RHD / 2) for x in (BR_S0, BR_S1) for c in TRACKS for sg in (-1, 1))
so_min = min(track_pt(x, c, sg * RHD / 2, 0.0)[1] - deck_z(x, c + sg * RHD / 2) for x in (BR_S0, BR_S1) for c in TRACKS for sg in (-1, 1))
clear = min(br_section(x)['soffit'] - terrain_at(x, 0.0) for x in br_st[2:-2])
print(f'bridge: free width {vl_rail - vr_rail:.2f} m, edge beam foot {BR_KB_IN:.2f} m from CL (>= 2.20), SO-deck >= {so_min:.3f} m,'
      f' ballast under the sleepers >= {bt_min - 0.05:.3f} m incl. 50 mm tolerance (>= 0.35), deck clearance over the stream bank {clear:.2f} m')


# ------------------------------------------------------------------ transition wedges (BN1-6-7, figure 12.1-1)
CUR[0] = '03-Jord'
st_sg = style('Stabilt grus (kile)', (0.84, 0.72, 0.48))
for nm, lo, hi, s_wall in (('nord', BR_S0 - LOZ, BR_S0 - FILTER_W, BR_S0), ('syd', BR_S1 + FILTER_W, BR_S1 + LOZ, BR_S1)):
    idx = [i for i, x in enumerate(stations) if lo - 1e-9 <= x <= hi + 1e-9]
    sts = [stations[i] for i in idx]; frs = [frames[i] for i in idx]; scs = [{'w': secs[i]['wedge']} for i in idx]
    element('IfcCourse', f'Aflastningskile {nm} (stabilt grus, Loz = {LOZ:.0f} m)', loft('w', sts, frs, scs), part_sub, st_sg, 'USERDEFINED', 'SUBBALLAST',
            psets={'Vispecta_BN1-6-7': {'Norm': 'BN1-6-7 afsnit 15.1 og figur 12.1-1 (overgangszone ved underføring)', 'Loz': LOZ, 'Krav_Loz_160_200': 17.0,
                                        'Dybde_under_stabilt_grus_ved_bro': WEDGE_D, 'Materiale': 'Stabilt grus', 'EV2_ved_underfoering_MPa': 120}})
    CUR[0] = '04-Afvanding'
    # filter material against the back of the abutment and a drain pipe at the bottom of the wedge
    sgn = -1 if s_wall == BR_S0 else 1                    # from the wall into the embankment
    sc = section(s_wall, lambda v, s=s_wall: terrain_at(s_wall, v))
    w = sc['wedge']; top_l, top_r = w[0], w[2]; bot_l, bot_r = w[5], w[3]
    a_back = s_wall + sgn * FILTER_W
    pl_l = (top_l[0] - EMB * UT1, top_l[1] + UT1); pl_r = (top_r[0] + EMB * UT1, top_r[1] + UT1)   # planum edges
    poly_full = [(bot_l[0], bot_l[1]), pl_l, (VR, w[1][1] + UT1), pl_r, (bot_r[0], bot_r[1]), (VR, w[4][1])]
    f0, f1 = frame(basis1, min(s_wall, a_back)), frame(basis1, max(s_wall, a_back))
    element('IfcCourse', f'Filtermateriale bag landfæste {nm}', loft('p', [min(s_wall, a_back), max(s_wall, a_back)], [f0, f1], [{'p': poly_full}, {'p': poly_full}]),
            part_drain, style('Filtermateriale', (0.78, 0.76, 0.70)), 'USERDEFINED', 'FILTER')
    fm_ = frame(basis1, s_wall + sgn * FILTER_W / 2)
    zb_l, zb_r = bot_l[1] + DRAIN_D, bot_r[1] + DRAIN_D
    element('IfcPipeSegment', f'Drænrør bag landfæste {nm} (ø160, BN1-11)', cyl(w3(fm_, bot_l[0] - 0.3, 0, zb_l), w3(fm_, bot_r[0] + 0.3, 0, zb_r), DRAIN_D / 2, 12),
            part_drain, style('Drænrør (PP)', (0.15, 0.15, 0.15)), 'USERDEFINED', 'DRAIN')
    CUR[0] = '03-Jord'
print('wedges: at the abutments the stable gravel goes', round(wedge_depth(BR_S0), 3), 'm below the planum (normal', UT1, 'm), running out over', LOZ, 'm on both sides')


# ------------------------------------------------------------------ bridge: stairs and cable ducts in the edge beams
CUR[0] = '05-Bro'
st_stair = style('Trappe (beton)', (0.70, 0.70, 0.68))
for s_st, nm in ((BR_S0 - 3.0, 'nord'), (BR_S1 + 3.0, 'syd')):
    sc = section(s_st, lambda v, s=s_st: terrain_at(s_st, v))
    fr = frame(basis1, s_st)
    for key, side, sn in (('muld_l', 1, 'venstre'), ('muld_r', -1, 'højre')):
        B, T2 = sc[key][1], sc[key][2]
        n = max(2, math.ceil((B[1] - T2[1]) / 0.17)); r_ = (B[1] - T2[1]) / n; g_ = (T2[0] - B[0]) / n
        steps = []
        for k in range(n):
            v0, v1_ = B[0] + g_ * k, B[0] + g_ * (k + 1); zt_ = B[1] - r_ * (k + 1) + r_
            steps.append(prism([(min(v0, v1_) - B[0], -0.5), (max(v0, v1_) - B[0], -0.5), (max(v0, v1_) - B[0], 0.5), (min(v0, v1_) - B[0], 0.5)], zt_ - 0.30, zt_ - r_ * 0 , fr, B[0]))
        element('IfcStair', f'Trappe {nm} {sn} (servicepassage → terræn, {n} trin)', merge(*steps), br_sub, st_stair, 'STRAIGHT_RUN_STAIR',
                psets={'Vispecta_BN1-59-5': {'Norm': 'BN1-59-5 11.2.2: trappetrin ved højdeforskel >= 0,5 m', 'Trin': n, 'Stigning_m': round(r_, 3), 'Grund_m': round(abs(g_), 3)}})
CUR[0] = '07-El-og-kabler'
st_duct = style('Kabelrør (PE)', (0.95, 0.55, 0.10))
for (vkb, ktk, sg, sn) in ((vl_kb, 0, 1, 'venstre'), (vr_kb, 1, -1, 'højre')):
    for j, dv in enumerate((0.45, 0.75)):
        pts_ = []
        for x in (BR_S0, BR_S1):
            frx = frame(basis1, x); kt = br_section(x)['kt'][ktk]
            pts_.append(w3(frx, vkb + sg * dv, 0, kt - 0.25))
        element('IfcCableCarrierSegment', f'Kabelkanal i kantbjælke {sn} nr. {j + 1} (PE ø110)', cyl(pts_[0], pts_[1], 0.055, 12), part_cable, st_duct, 'CONDUITSEGMENT')

# ------------------------------------------------------------------ crossover: two turnouts 60E1-500-1:12 with point heating
CUR[0] = '02-Spor'
part_xo = run('root.create_entity', ifc_class='IfcRailwayPart', name='Sporskifteforbindelse spor 1 → spor 2 (2 × 60E1-500-1:12)', predefined_type='TURNOUTTRACK')
part_xo.UsageType = 'LONGITUDINAL'
run('aggregate.assign_object', relating_object=rail, products=[part_xo]); run('geometry.edit_object_placement', product=part_xo)
def rail_section(s_, c, u):
    sg = 1 if u < 0 else -1
    a_ = math.atan(RAIL_INCL); ca, sa = math.cos(a_), math.sin(a_)
    return [track_pt(s_, c, u + px * ca + sg * py * sa, RAIL_H - (-sg * px * sa + py * ca)) for px, py in RAIL_PROFILE][::-1]
def div_rail(side, x0, x1, step=1.0):
    xs = [x0 + (x1 - x0) * k / max(1, math.ceil((x1 - x0) / step)) for k in range(max(1, math.ceil((x1 - x0) / step)) + 1)]
    secs_ = []
    for x in xs:
        vc, th = xo_v(x)
        secs_.append({'r': rail_section(XO_S + x, vc, side * RHD / 2 / math.cos(th))})
    return gloft('r', xs, [frame(basis1, XO_S + x) for x in xs], secs_)
x_sep = math.sqrt(2 * XO_R * 0.16)           # where the closure rail is 0.16 m off the stock rail
BLADE = 16.0
xo_ps = {'Vispecta_Spor': {'Type': '60E1-500-1:12 (forenklet geometri: R = 500 m til 1:12, ret mellemstykke, R = 500 m tilbage)',
                           'Sporafstand': FS, 'Laengde_forbindelse_m': round(XO_X3, 2), 'Hastighed_afvigende_spor': '60 km/h (antaget)'}}
st_rail = rail_style
element('IfcTrackElement', 'Sporskifte 1: tunge (krum, venstre)', div_rail(-1, 0.5, BLADE), part_xo, st_rail, 'HALF_SET_OF_BLADES', psets=xo_ps)
element('IfcRail', 'Sporskifteforbindelse: skinne venstre', div_rail(-1, BLADE, XO_X3 - x_sep), part_xo, st_rail, 'RAIL')
element('IfcRail', 'Sporskifteforbindelse: skinne højre', div_rail(1, x_sep, XO_X3 - BLADE), part_xo, st_rail, 'RAIL')
element('IfcTrackElement', 'Sporskifte 2: tunge (krum, højre)', div_rail(1, XO_X3 - BLADE, XO_X3 - 0.5), part_xo, st_rail, 'HALF_SET_OF_BLADES')
x_f1 = XO_R * math.sin(math.acos(1 - 1.5 / XO_R)); x_f2 = XO_X3 - x_f1
st_frog = style('Krydsning (manganstål)', (0.30, 0.30, 0.32))
for nm, xf, vf in (('Sporskifte 1: krydsning 1:12', x_f1, -RHD / 2), ('Sporskifte 2: krydsning 1:12', x_f2, -FS + RHD / 2)):
    frf = frame(basis1, XO_S + xf); zs_ = track_pt(XO_S + xf, 0.0, 0.0, RAIL_H + PAD)[1]
    element('IfcTrackElement', nm, prism([(-0.17, -2.0), (0.17, -2.0), (0.17, 2.0), (-0.17, 2.0)], zs_, zs_ + PAD + RAIL_H - 0.002, frf, vf), part_xo, st_frog, 'FROG')
for nm, xf, vc_ in (('Sporskifte 1: kontraskinne', x_f1, RHD / 2 - 0.08), ('Sporskifte 2: kontraskinne', x_f2, -FS - RHD / 2 + 0.08)):
    frf = frame(basis1, XO_S + xf); zs_ = track_pt(XO_S + xf, 0.0, 0.0, RAIL_H + PAD)[1]
    element('IfcRail', nm, prism([(-0.03, -3.0), (0.03, -3.0), (0.03, 3.0), (-0.03, 3.0)], zs_ + 0.03, zs_ + PAD + RAIL_H + 0.04, frf, vc_), part_xo, st_rail, 'USERDEFINED')
st_pm = style('Drivmaskine', (0.85, 0.72, 0.12))
for nm, x, v_ in (('Sporskifte 1: drivmaskine', 1.5, 1.95), ('Sporskifte 2: drivmaskine', XO_X3 - 1.5, -FS - 1.95)):
    frp = frame(basis1, XO_S + x); zs_ = track_pt(XO_S + x, 0.0, 0.0, RAIL_H + PAD)[1]
    element('IfcActuator', nm, prism([(-0.6, -0.25), (0.6, -0.25), (0.6, 0.25), (-0.6, 0.25)], zs_ - 0.05, zs_ + 0.25, frp, v_), part_xo, st_pm, 'ELECTRICACTUATOR')
# frispormærker (BN1-154-3, 15): midway between the tracks where their centres are f0 = 4.25 m apart
F0 = 4.25
x_m = XO_R * math.sin(math.acos(1 - (FS - F0) / XO_R))
st_fsm = style('Frispormærke (hvid)', (0.97, 0.97, 0.97))
for nm, x, vm_ in (('Frispormærke ved sporskifte 2 (spor 2 / forbindelse)', x_m, (xo_v(x_m)[0] - FS) / 2),
                   ('Frispormærke ved sporskifte 1 (spor 1 / forbindelse)', XO_X3 - x_m, xo_v(XO_X3 - x_m)[0] / 2)):
    frp = frame(basis1, XO_S + x); zs_ = track_pt(XO_S + x, 0.0, 0.0, RAIL_H + PAD)[1] - CRIB
    element('IfcSign', nm, prism([(-0.10, -0.10), (0.10, -0.10), (0.10, 0.10), (-0.10, 0.10)], zs_ - 0.30, zs_ + 0.25, frp, vm_), part_xo, st_fsm, 'MARKER',
            psets={'Vispecta_BN1-154-3': {'Norm': 'BN1-154-3 afsnit 15 og tabel 14.1', 'f0': F0, 'Station': round(START_STATION + XO_S + x, 2),
                                          'Placering': 'Midt mellem sporene, hvor sporafstanden er f0'}})
# point heating (electric): heating rods on the stock rails in the switch, a cabinet on the banket, a feed cable
CUR[0] = '07-El-og-kabler'
st_heat = style('Sporskiftevarme', (0.80, 0.10, 0.10)); st_cab = style('Styreskab', (0.55, 0.60, 0.62)); st_cbl = style('Kabel', (0.10, 0.10, 0.10))
for nm, xa, xb, c_, v_cab, x_cab in (('Sporskifte 1', -1.0, BLADE + 1.0, 0.0, TRACKS[0] + 4.75, -5.0), ('Sporskifte 2', XO_X3 - BLADE - 1.0, XO_X3 + 1.0, -FS, TRACKS[1] - 4.75 + 0.0, XO_X3 + 5.0)):
    rods = []
    for u_ in (-RHD / 2 - 0.09, RHD / 2 + 0.09):
        za = track_pt(XO_S + xa, c_, 0, RAIL_H + PAD)[1] + 0.025; zb_ = track_pt(XO_S + xb, c_, 0, RAIL_H + PAD)[1] + 0.025
        rods.append(cyl(w3(frame(basis1, XO_S + xa), c_ - u_, 0, za), w3(frame(basis1, XO_S + xb), c_ - u_, 0, zb_), 0.012, 6))
    element('IfcElectricAppliance', f'{nm}: sporskiftevarme (elektrisk, 2 × {xb - xa:.0f} m)', merge(*rods), part_xo, st_heat, 'USERDEFINED', 'SPORSKIFTEVARME',
            psets={'Vispecta_El': {'Type': 'Elektrisk sporskiftevarme på stokskinner og tunger', 'Effekt_kW': 6.0, 'Styring': 'Vejrstation / styreskab'}})
    sc_c = section(XO_S + x_cab, lambda v, s=XO_S + x_cab: terrain_at(XO_S + x_cab, v)); frc = frame(basis1, XO_S + x_cab)
    zg = sc_c['zp'](v_cab)
    element('IfcElectricDistributionBoard', f'{nm}: styreskab for sporskiftevarme', merge(
        prism([(-0.3, -0.5), (0.3, -0.5), (0.3, 0.5), (-0.3, 0.5)], zg - 0.6, zg + 0.1, frc, v_cab),
        prism([(-0.2, -0.4), (0.2, -0.4), (0.2, 0.4), (-0.2, 0.4)], zg + 0.1, zg + 1.5, frc, v_cab)), part_cable, st_cab, 'DISTRIBUTIONBOARD')
    p_a = w3(frc, v_cab, 0, zg - 0.2); p_b = w3(frame(basis1, XO_S + xa), c_ + (RHD / 2 + 0.09) * (1 if v_cab > c_ else -1), 0, track_pt(XO_S + xa, c_, 0, RAIL_H + PAD)[1] - 0.25)
    element('IfcCableSegment', f'{nm}: forsyningskabel til sporskiftevarme', cyl(p_a, p_b, 0.015, 6), part_cable, st_cbl, 'CABLESEGMENT')

# ------------------------------------------------------------------ rail welds (aluminothermic, every 120 m)
CUR[0] = '02-Spor'
st_weld = style('Svejsning', (0.62, 0.48, 0.30))
nw = 0
for k_, c_ in ((1, TRACKS[0]), (2, TRACKS[1])):
    for j in range(25):
        sw = 60.0 * (k_ - 1) + 30.0 + 120.0 * j
        if sw > TOTAL1 - 5: break
        for key, u_ in (('l', -RHD / 2), ('r', RHD / 2)):
            secs_ = []
            for x in (sw - 0.05, sw + 0.05):
                poly = rail_section(x, c_, u_)
                cx = sum(v for v, z in poly) / len(poly); cz = sum(z for v, z in poly) / len(poly)
                secs_.append({'w': [(cx + (v - cx) * 1.12, cz + (z - cz) * 1.10) for v, z in poly]})
            element('IfcFastener', f'Svejsning spor {k_} skinne {"venstre" if key == "l" else "højre"} st. {START_STATION + sw:.0f}', gloft('w', [sw - 0.05, sw + 0.05], [frame(basis1, sw - 0.05), frame(basis1, sw + 0.05)], secs_),
                    part_t1 if k_ == 1 else part_t2, st_weld, 'WELD', psets={'Vispecta_Spor': {'Type': 'Aluminotermisk svejsning', 'Station': round(START_STATION + sw, 1)}})
            nw += 1

# ------------------------------------------------------------------ km marks (BN1-160-1: every 200 m, 3.0 m from the nearest track centre, 2 m above SO)
st_km = style('Km-mærke (hvid, reflekterende)', (0.98, 0.98, 0.98)); st_post = style('Stander (galvaniseret)', (0.60, 0.62, 0.64))
nkm = 0
for km_ in range(int(START_STATION), int(START_STATION + TOTAL1) + 1, 200):
    hm = (km_ // 100) % 10
    sides = [1, -1] if hm == 0 else ([-1] if hm in (2, 6) else [1])
    for sg in sides:
        s_k = km_ - START_STATION
        if any(abs(s_k - ms) < 1.5 for ms in mast_s): s_k += 2.5            # clear of the mast foundations
        s_k = min(s_k, TOTAL1 - 0.5)
        frk = frame(basis1, s_k); c_ = TRACKS[0] if sg > 0 else TRACKS[1]
        so = track_pt(s_k, c_, 0.0, 0.0)[1]
        if BR_S0 <= s_k <= BR_S1:
            v_k = (vl_rail if sg > 0 else vr_rail) + sg * 0.06                # on the railing of the bridge (BN1-160-1, 12.2)
            z_b = br_section(s_k)['kt'][0 if sg > 0 else 1] + 1.45; post = None
        else:
            v_k = c_ + sg * 3.0
            z_b = so + 2.0
            zg = section(s_k, lambda v, s=s_k: terrain_at(s_k, v))['zp'](v_k)
            post = cyl(w3(frk, v_k, 0.0, zg - 0.6), w3(frk, v_k, 0.0, z_b - 0.10), 0.03, 8)
        board = prism([(-0.156, -0.005), (0.156, -0.005), (0.156, 0.005), (-0.156, 0.005)], z_b - 0.156, z_b + 0.156, frk, v_k)
        txt = f'{km_ // 1000},{hm}'
        element('IfcSign', f'Km-mærke {txt} ({"venstre" if sg > 0 else "højre"})', merge(board, post) if post else board, part_t1 if sg > 0 else part_t2, st_km, 'MARKER',
                psets={'Vispecta_BN1-160-1': {'Norm': 'BN1-160-1 afsnit 11 og 12.2', 'Km': km_ // 1000, 'Hektometer': hm, 'Tekst': txt,
                                              'Tavle_mm': '312 x 312', 'Afstand_spormidte': 3.0, 'Hoejde_over_SO': 2.0}})
        nkm += 1

# ------------------------------------------------------------------ trees and the stream (landscape)
CUR[0] = '09-Landskab'
TREES = [(120, 30, 'Stilkeg (Quercus robur)', 14), (128, 37, 'Stilkeg (Quercus robur)', 12), (141, 31, 'Rødel (Alnus glutinosa)', 10),
         (612, -34, 'Ask (Fraxinus excelsior)', 13), (624, -41, 'Ask (Fraxinus excelsior)', 11),
         (1310, 34, 'Bøg (Fagus sylvatica)', 16), (1322, 41, 'Bøg (Fagus sylvatica)', 15), (1331, 30, 'Bøg (Fagus sylvatica)', 13), (1346, 37, 'Birk (Betula pendula)', 11),
         (1962, -36, 'Rødel (Alnus glutinosa)', 10), (1976, -30, 'Rødel (Alnus glutinosa)', 9),
         (2311, 33, 'Stilkeg (Quercus robur)', 15), (2321, 42, 'Birk (Betula pendula)', 12), (2336, 29, 'Stilkeg (Quercus robur)', 13)]
def sphere(c, r, nlat=5, nlon=10):
    pts = [(c[0], c[1], c[2] + r)]
    for i in range(1, nlat):
        th = math.pi * i / nlat
        for j in range(nlon):
            ph = 2 * math.pi * j / nlon
            pts.append((c[0] + r * math.sin(th) * math.cos(ph), c[1] + r * math.sin(th) * math.sin(ph), c[2] + r * math.cos(th) * 0.85))
    pts.append((c[0], c[1], c[2] - r * 0.85))
    tris = []
    for j in range(nlon): tris.append((0, 1 + j, 1 + (j + 1) % nlon))
    for i in range(nlat - 2):
        a0, b0 = 1 + i * nlon, 1 + (i + 1) * nlon
        for j in range(nlon):
            j2 = (j + 1) % nlon
            tris += [(a0 + j, b0 + j, b0 + j2), (a0 + j, b0 + j2, a0 + j2)]
    last = len(pts) - 1; b0 = 1 + (nlat - 2) * nlon
    for j in range(nlon): tris.append((last, b0 + (j + 1) % nlon, b0 + j))
    return pts, tris
st_trunk = style('Træstamme', (0.35, 0.25, 0.17)); st_crown = style('Trækrone', (0.30, 0.48, 0.22))
tree_xyz = []
for st_, v_, sp, h_ in TREES:
    frt = frame(basis1, st_); zg = terrain_at(st_, v_)
    base = w3(frt, v_, 0, zg); r_c = h_ * 0.28
    top = (base[0], base[1], zg + h_ - r_c * 0.9)
    tree_xyz.append((base, h_, r_c))
    el_t = element('IfcGeographicElement', f'Træ: {sp}, h = {h_} m', merge(cyl((base[0], base[1], zg - 0.3), (base[0], base[1], top[2]), 0.04 * h_ / 2, 8), sphere(top, r_c)),
                   site, st_crown, 'VEGETATION', psets={'Vispecta_Landskab': {'Art': sp, 'Hoejde_m': h_, 'Kronediameter_m': round(2 * r_c, 1), 'Station': START_STATION + st_, 'Sideafstand_m': v_}})
# the stream under the bridge: a water surface
c_, b_, d_ = STREAM
wpts = []
for v_ in [VR + i * 5.0 - 55.0 for i in range(23)]:
    zw = terrain_at(c_, v_) + 0.30
    for a_ in (-2.6, 2.6):
        wpts.append(w3(frame(basis1, c_ + a_), v_, 0, zw))
wtris = []
for i in range(22):
    a0 = i * 2
    wtris += [(a0, a0 + 2, a0 + 3), (a0, a0 + 3, a0 + 1)]
element('IfcGeographicElement', 'Vandløb (vandspejl)', (wpts, wtris), site, style('Vand', (0.35, 0.60, 0.85)), 'USERDEFINED', 'VANDLØB', closed=False,
        psets={'Vispecta_Landskab': {'Bundbredde_m': b_, 'Dybde_m': d_, 'Anlaeg': '1:2', 'Vanddybde_m': 0.30}})
print(f'crossover: {XO_X3:.2f} m long, frogs at x = {x_f1:.2f} / {x_f2:.2f} m, frispormærker at x = {x_m:.2f} / {XO_X3 - x_m:.2f} m; welds {nw}; km marks {nkm}; trees {len(TREES)}')

# ------------------------------------------------------------------ sleepers (one type, mapped geometry)
# B99-type monoblock concrete sleeper as a plain box 2.60 x 0.30 x 0.22 m, every 0.625 m along each
# track. All sleepers share one representation map; each occurrence only has its own placement: on
# the track centre, top at the rail seat (SO - rail - pad), tilted with the cant, across the track.
# S99 (Banedanmark, Sporteknik 2nd ed. p. 83-84; GAB Spor bilag 0-1): prestressed monoblock, 2500 mm long,
# 300 mm wide, 206 mm high at the rail seat, about 240 kg, Pandrol Fastclip, rail seats inclined 1:40.
# The shape between those measures follows figure 86 (S89/S99 have the same body); the exact
# drawing (normaltegning blad 7931/7141) is not public, so the middle and end values are assumed.
# Local axes: x along the sleeper (left +), y along the track, z up; z = 0 is the rail seat at the rail centre.
SEAT = RHD / 2
prof_x = [(0.00, 0.175, 0.250, 0.200), (0.35, 0.175, 0.250, 0.200), (0.50, 0.195, 0.290, 0.230), (0.64, 0.206, 0.300, 0.240),
          (0.84, 0.206, 0.300, 0.240), (1.10, 0.206, 0.300, 0.240), (1.25, 0.176, 0.300, 0.200)]   # |x|, height, bottom width, top width
def seat_top(ax, h):
    """Top of the body at |x|: the rail seat falls 1:40 towards the track centre; elsewhere bottom + height."""
    base = -SL_H
    if 0.64 <= ax <= 0.84: return (ax - SEAT) * RAIL_INCL
    return base + h
rings = [(-x, h, bw, tw) for x, h, bw, tw in reversed(prof_x[1:])] + [(x, h, bw, tw) for x, h, bw, tw in prof_x]
bp, bt = [], []
for x, h, bw, tw in rings:
    zt = seat_top(abs(x), h)
    bp += [(x, -bw / 2, -SL_H), (x, bw / 2, -SL_H), (x, tw / 2, zt), (x, -tw / 2, zt)]
for r in range(len(rings) - 1):
    a, b = r * 4, (r + 1) * 4
    for q in range(4):
        q2 = (q + 1) % 4
        bt += [(a + q, b + q, b + q2), (a + q, b + q2, a + q2)]
last = (len(rings) - 1) * 4
bt += [(0, 2, 1), (0, 3, 2), (last, last + 1, last + 2), (last, last + 2, last + 3)]
def box(x0, x1, y0, y1, z0, z1):
    P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    T = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    return P, T
def mergeb(*ms):
    P, T = [], []
    for p_, t_ in ms:
        o = len(P); P += p_; T += [(a + o, b + o, c + o) for a, b, c in t_]
    return P, T
FOOT = 0.075
pads, steel = [], []
for sx in (1, -1):
    xc = sx * SEAT
    pads.append(box(xc - FOOT - 0.005, xc + FOOT + 0.005, -0.09, 0.09, 0.0, PAD))   # rail pad 160 x 180 x 10 mm
    for side in (1, -1):   # Fastclip shoulders (cast into the sleeper) and clip toes on the rail foot, both sides of the rail
        xs = xc + side * (FOOT + 0.012)
        steel.append(box(min(xs, xs + side * 0.045), max(xs, xs + side * 0.045), -0.05, 0.05, -0.01, 0.045))
        steel.append(box(min(xc + side * 0.055, xs + side * 0.03), max(xc + side * 0.055, xs + side * 0.03), -0.035, 0.035, PAD + 0.012, PAD + 0.028))
def tfs(m):
    p_, t_ = m
    return f.createIfcTriangulatedFaceSet(f.createIfcCartesianPointList3D(p_), None, True, [(a + 1, b + 1, c + 1) for a, b, c in t_], None)
it_body, it_pad, it_steel = tfs((bp, bt)), tfs(mergeb(*pads)), tfs(mergeb(*steel))
map_rep = f.createIfcShapeRepresentation(body, 'Body', 'Tessellation', [it_body, it_pad, it_steel])
for it, nm, rgb in ((it_body, 'Betonsvelle S99', (0.66, 0.66, 0.64)), (it_pad, 'Mellemlæg (EVA)', (0.12, 0.12, 0.12)), (it_steel, 'Fastclip (stål)', (0.30, 0.31, 0.33))):
    col = f.createIfcColourRgb(None, *rgb)
    f.createIfcStyledItem(it, [f.createIfcSurfaceStyle(nm, 'BOTH', [f.createIfcSurfaceStyleShading(col, 0.0)])], None)
o3 = f.createIfcCartesianPoint((0.0, 0.0, 0.0))
rmap = f.createIfcRepresentationMap(f.createIfcAxis2Placement3D(o3, None, None), map_rep)
ntri = len(bt) + sum(len(t_) for _, t_ in pads + steel)
sl_type = run('root.create_entity', ifc_class='IfcTrackElementType', name='S99 monoblok betonsvelle med Pandrol Fastclip', predefined_type='SLEEPER')
sl_type.RepresentationMaps = [rmap]
ps = run('pset.add_pset', product=sl_type, name='Vispecta_Svelle')
run('pset.edit_pset', pset=ps, properties={'Type': 'S99 monoblok betonsvelle, forspændt, Pandrol Fastclip', 'Kilde': 'Banedanmark Sporteknik 2. udg. s. 83-84; GAB Spor bilag 0-1',
                                            'Laengde': SL_LEN, 'Bredde': SL_W, 'Hoejde_ved_skinneleje': SL_H, 'Vaegt_ca_kg': 240, 'Armering': '10 tråde',
                                            'Maks_hastighed': '180 km/h', 'Aksellast': '22,5 t', 'Skinnehaeldning': '1:40', 'Svelleafstand': SL_SPACING,
                                            'Note': 'Mål mellem skinnelejerne og ved enderne er antaget efter figur 86 (normaltegning blad 7931/7141 ikke offentlig)'})
op = f.createIfcCartesianTransformationOperator3D(None, None, o3, None, None)
site_pl = site.ObjectPlacement

def s1_of_s2(s2):   # inverse of s2_of (piecewise linear)
    a1 = a2 = 0.0
    for (k1, L1, *_), (k2, L2, *_) in zip(segs1, segs2):
        if s2 <= a2 + L2 + 1e-9:
            return a1 + (s2 - a2) * L1 / L2
        a1 += L1; a2 += L2
    return a1 + (s2 - a2)

TOTAL2 = sum(sg[1] for sg in segs2)
count = {}
all_sleepers = []
for k, (c, part, total, to_s1) in enumerate(((TRACKS[0], part_t1, TOTAL1, lambda x: x), (TRACKS[1], part_t2, TOTAL2, s1_of_s2))):
    occ = []
    n = int((total - SL_SPACING / 2) / SL_SPACING) + 1
    for j in range(n):
        sj = SL_SPACING / 2 + j * SL_SPACING     # along this track
        s = to_s1(sj)                            # the section through track 1
        if XO_ZONE[0] <= s <= XO_ZONE[1]: continue   # long turnout sleepers under both tracks there
        px, py, tx, ty = frame(basis1, s)
        t = math.asin(cant(s) / RHD)
        v0, z0 = track_pt(s, c, 0.0, RAIL_H + PAD)   # top of the sleeper on the track centre
        loc = (px - ty * v0, py + tx * v0, z0)
        xdir = (-ty * math.cos(t), tx * math.cos(t), -math.sin(t))   # along the sleeper, to the left, in the SO plane
        zdir = (-ty * math.sin(t), tx * math.sin(t), math.cos(t))    # normal to the SO plane
        pl = f.createIfcLocalPlacement(site_pl, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint(loc), f.createIfcDirection(zdir), f.createIfcDirection(xdir)))
        shape = f.createIfcProductDefinitionShape(None, None, [f.createIfcShapeRepresentation(body, 'Body', 'MappedRepresentation', [f.createIfcMappedItem(rmap, op)])])
        occ.append(f.createIfcTrackElement(ifcopenshell.guid.new(), None, f'Svelle spor {k + 1} nr. {j + 1}', None, None, pl, shape, f'S{k + 1}-{j + 1:04d}', 'SLEEPER'))
    f.createIfcRelContainedInSpatialStructure(ifcopenshell.guid.new(), None, None, None, occ, part)
    FAG.setdefault('02-Spor', []).extend(occ)
    all_sleepers += occ
    count[k + 1] = (len(occ), round(SL_SPACING / 2 + (len(occ) - 1) * SL_SPACING, 3), round(total, 3))
f.createIfcRelDefinesByType(ifcopenshell.guid.new(), None, None, None, all_sleepers, sl_type)
# long turnout sleepers (simplified boxes 7.00 x 0.26 x 0.206 m under both tracks) in the crossover
LT = TRACKS[0] + SL_LEN / 2 - (TRACKS[1] - SL_LEN / 2)
lt_rep = f.createIfcShapeRepresentation(body, 'Body', 'Tessellation', [tfs(box(-LT / 2, LT / 2, -0.13, 0.13, -SL_H, 0.0))])
f.createIfcStyledItem(lt_rep.Items[0], [f.createIfcSurfaceStyle('Sporskiftesvelle', 'BOTH', [f.createIfcSurfaceStyleShading(f.createIfcColourRgb(None, 0.62, 0.62, 0.60), 0.0)])], None)
lt_map = f.createIfcRepresentationMap(f.createIfcAxis2Placement3D(o3, None, None), lt_rep)
lt_type = run('root.create_entity', ifc_class='IfcTrackElementType', name=f'Sporskiftesvelle beton (forenklet, {LT:.2f} m)', predefined_type='SLEEPER')
lt_type.RepresentationMaps = [lt_map]
lt_occ = []
x_ = XO_ZONE[0] + 0.3
while x_ <= XO_ZONE[1] - 0.3:
    px, py, tx, ty = frame(basis1, x_)
    v0, z0 = track_pt(x_, VR, 0.0, RAIL_H + PAD)
    pl = f.createIfcLocalPlacement(site_pl, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((px - ty * v0, py + tx * v0, z0)), f.createIfcDirection((0.0, 0.0, 1.0)), f.createIfcDirection((-ty, tx, 0.0))))
    shape = f.createIfcProductDefinitionShape(None, None, [f.createIfcShapeRepresentation(body, 'Body', 'MappedRepresentation', [f.createIfcMappedItem(lt_map, op)])])
    lt_occ.append(f.createIfcTrackElement(ifcopenshell.guid.new(), None, f'Sporskiftesvelle nr. {len(lt_occ) + 1}', None, None, pl, shape, f'SP-{len(lt_occ) + 1:03d}', 'SLEEPER'))
    x_ += 0.60
f.createIfcRelContainedInSpatialStructure(ifcopenshell.guid.new(), None, None, None, lt_occ, part_xo)
f.createIfcRelDefinesByType(ifcopenshell.guid.new(), None, None, None, lt_occ, lt_type)
FAG.setdefault('02-Spor', []).extend(lt_occ)
print('turnout sleepers', len(lt_occ))
print('sleepers per track (count, last at, track length):', count, '| triangles per sleeper', ntri)

f.write(OUT)
print('written', OUT)

# ------------------------------------------------------------------ survey point cloud (existing terrain before construction, map coordinates)
import numpy as np, laspy
rng = np.random.default_rng(7)
fr_s = np.array([frame(basis1, float(x)) for x in range(int(TOTAL1) + 2)])
N = 420000
S = rng.uniform(0, TOTAL1, N); Vv = rng.uniform(-55.0, 50.0, N)
Z = np.array([terrain_at(a, b) for a, b in zip(S, Vv)]) + rng.normal(0, 0.015, N)
cls = np.full(N, 2, np.uint8)
wet = np.abs(S - STREAM[0]) < 2.6                       # no returns from the water, a few class 9 points
keep = ~wet | (rng.random(N) < 0.04)
S, Vv, Z, cls = S[keep], Vv[keep], Z[keep], cls[keep]; cls[np.abs(S - STREAM[0]) < 2.6] = 9
idx = np.minimum(S.astype(int), len(fr_s) - 1); a_ = S - idx
px, py, tx, ty = fr_s[idx, 0], fr_s[idx, 1], fr_s[idx, 2], fr_s[idx, 3]
X = px - ty * Vv + tx * a_; Y = py + tx * Vv + ty * a_
xs, ys, zs, cs = [X], [Y], [Z], [cls]
for base, h_, r_c in tree_xyz:                           # crowns and trunks
    n = 900
    u = rng.normal(size=(n, 3)); u /= np.linalg.norm(u, axis=1)[:, None]
    rr = r_c * (0.75 + 0.25 * rng.random(n))
    cz = base[2] + h_ - r_c * 0.9
    xs.append(base[0] + u[:, 0] * rr); ys.append(base[1] + u[:, 1] * rr); zs.append(cz + u[:, 2] * rr * 0.85); cs.append(np.full(n, 5, np.uint8))
    m = 80; hh = rng.uniform(0, h_ - 2 * r_c * 0.9, m)
    xs.append(base[0] + rng.normal(0, 0.12, m)); ys.append(base[1] + rng.normal(0, 0.12, m)); zs.append(base[2] + hh); cs.append(np.full(m, 4, np.uint8))
for _ in range(40):                                      # bushes
    sb, vb = rng.uniform(0, TOTAL1), rng.choice([-1, 1]) * rng.uniform(16, 50)
    if abs(sb - STREAM[0]) < 6: continue
    i0 = min(int(sb), len(fr_s) - 1); p_, q_, t1_, t2_ = fr_s[i0]
    m = 120; dv, da = rng.normal(0, 0.9, m), rng.normal(0, 0.9, m)
    zg = terrain_at(sb, vb)
    xs.append(p_ - t2_ * (vb + dv) + t1_ * da); ys.append(q_ + t1_ * (vb + dv) + t2_ * da); zs.append(zg + rng.uniform(0.2, 1.4, m)); cs.append(np.full(m, 3, np.uint8))
nz = 250
xs.append(X[:nz] + rng.normal(0, 2, nz)); ys.append(Y[:nz] + rng.normal(0, 2, nz)); zs.append(Z[:nz] + rng.uniform(15, 40, nz)); cs.append(np.full(nz, 7, np.uint8))
X = np.concatenate(xs) + 680000.0; Y = np.concatenate(ys) + 6150000.0; Z = np.concatenate(zs); C = np.concatenate(cs)
col = {2: (110, 130, 70), 3: (80, 120, 50), 4: (95, 75, 55), 5: (55, 100, 45), 7: (200, 200, 200), 9: (70, 110, 150)}
rgb = np.array([col[c] for c in C], float) + rng.normal(0, 12, (len(C), 3))
rgb = (np.clip(rgb, 0, 255) * 256).astype(np.uint16)
inten = np.where(C == 2, rng.normal(1400, 250, len(C)), rng.normal(700, 200, len(C))).clip(0, 65535).astype(np.uint16)
order = rng.permutation(len(C))
hdr = laspy.LasHeader(point_format=3, version='1.2'); hdr.scales = [0.001] * 3; hdr.offsets = [680000.0, 6150000.0, 0.0]
las = laspy.LasData(hdr)
las.x, las.y, las.z = X[order], Y[order], Z[order]; las.classification = C[order]
las.red, las.green, las.blue = rgb[order, 0], rgb[order, 1], rgb[order, 2]; las.intensity = inten[order]
las.write(os.path.join(OUT_DIR, '10-Opmaaling.laz'))
print('point cloud', len(C), 'points', dict(zip(*np.unique(C, return_counts=True))))

# ------------------------------------------------------------------ one IFC file per discipline
import ifcpatch.recipes.ExtractElements as EE
TITLES = {'02-Spor': 'Spor', '03-Jord': 'Jord og underbygning', '04-Afvanding': 'Afvanding', '05-Bro': 'Bro', '06-Koereledning': 'Køreledning',
          '07-El-og-kabler': 'El og kabler', '08-Terraen': 'Terræn', '09-Landskab': 'Landskab (træer og vandløb)'}
for fag, els in sorted(FAG.items()):
    pt = EE.Patcher(f, None, query='IfcNothing')
    pt.contained_ins = {}; pt.aggregates = {}; pt.new = ifcopenshell.file(schema_version=f.schema_version)
    pt.owner_history = None; pt.reuse_identities = {}
    pt.add_element(f.by_type('IfcProject')[0])
    for el in els: pt.add_element(el)
    pt.create_spatial_tree()
    pt.new.by_type('IfcProject')[0].Name = f'{TITLES.get(fag, fag)} – dobbeltsporet bane 180 km/h (BN1-6-7)'
    pt.new.write(os.path.join(OUT_DIR, f'{fag}.ifc'))
    print('written', fag, len(els), 'elements')

mid = section(1000.0, lambda v: terrain_at(1000.0, v))
print('lengths: track 1', round(TOTAL1, 3), 'track 2', round(sum(sg[1] for sg in segs2), 3))
print('section at 1000 m: ballast', [(round(a, 3), round(b, 3)) for a, b in mid['ballast']])
print('                    sub1', [(round(a, 3), round(b, 3)) for a, b in mid['sub1']])
print('written', OUT)
