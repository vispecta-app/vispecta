"""Writes public/samples/simple-scene/Infra-Alignment.ifc (python3 scripts/make-sample-alignment.py <out>).

Two IFC 4.3 alignments for buildingSMART's Simple-Scene, with the scene's units (mm), CRS and map
conversion, so they lie on its models:
- "Track": centre line of the rails in Infra-Rail.ifc – straight, 40 m, at top of rail, 0+000 to 0+040
- "Road": centre line of the carriageway in Infra-Road.ifc (through its centre line markings) –
  straight, 80 m, at road surface, 0+000 to 0+080
Each has a horizontal and a vertical layout (one LINE and one CONSTANTGRADIENT segment), a FootPrint
and Axis representation, and a station referent with Pset_Stationing. The output is the same on
every run (fixed GUID seed).
"""
import math, random, string, sys

# centre lines measured from the scene's geometry, in metres:
# (name, description, start x, start y, end x, end y, level)
ALIGNMENTS = [
    ('Track', 'Centre line of the rail track in the sample scene', 8.660, 55.000, 43.302, 35.000, 7.775),
    ('Road', 'Centre line of the road carriageway in the sample scene', -25.981, 5.000, 43.301, 45.000, 0.0),
]

random.seed(20261114)
CH = string.digits + string.ascii_uppercase + string.ascii_lowercase + '_$'
def guid():
    return random.choice('0123') + ''.join(random.choice(CH) for _ in range(21))

mm = lambda v: v * 1000.0
f = lambda v: repr(float(round(v, 6)))
lines = []
count = [0]
def e(s):
    count[0] += 1
    lines.append(f"#{count[0]}={s};")
    return f"#{count[0]}"

# --- project, units, georeferencing (as in the scene files)
org = e("IFCORGANIZATION($,'Vispecta','Sample alignments for the buildingSMART IFC 4.3 Simple-Scene',$,$)")
person = e("IFCPERSON($,'Vispecta',$,$,$,$,$,$)")
po = e(f"IFCPERSONANDORGANIZATION({person},{org},$)")
app = e(f"IFCAPPLICATION({org},'1','Vispecta sample generator','vispecta')")
oh = e(f"IFCOWNERHISTORY({po},{app},$,.ADDED.,1794700800,$,$,1794700800)")
o3 = e("IFCCARTESIANPOINT((0.,0.,0.))"); z3 = e("IFCDIRECTION((0.,0.,1.))"); x3 = e("IFCDIRECTION((1.,0.,0.))")
wcs = e(f"IFCAXIS2PLACEMENT3D({o3},{z3},{x3})")
ctx = e(f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.001,{wcs},$)")
axis_ctx = e(f"IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,{ctx},$,.MODEL_VIEW.,$)")
u1 = e("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"); u2 = e("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")
units = e(f"IFCUNITASSIGNMENT(({u1},{u2}))")
proj = e(f"IFCPROJECT('{guid()}',{oh},'Vispecta sample alignments','Alignments along the track and the road of the buildingSMART IFC 4.3 Simple-Scene',$,$,$,({ctx}),{units})")
crsu = e("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
crs = e(f"IFCPROJECTEDCRS('EPSG:32760','EPSG:32760 - WGS 84 / UTM zone 60S','WGS 84',$,$,$,{crsu})")
e(f"IFCMAPCONVERSION({ctx},{crs},729011.2258823584,9063960.607644705,0.,1.,0.,0.001)")
site_pl = e(f"IFCLOCALPLACEMENT($,{wcs})")
site = e(f"IFCSITE('{guid()}',{oh},'environment - site','Sample scene site',$,{site_pl},$,$,.ELEMENT.,$,$,0.,$,$)")
e(f"IFCRELAGGREGATES('{guid()}',{oh},$,$,{proj},({site}))")
o2 = e("IFCCARTESIANPOINT((0.,0.))"); d2 = e("IFCDIRECTION((1.,0.))")
line2 = e(f"IFCLINE({o2},{e(f'IFCVECTOR({d2},1.)')})")


def alignment(name, desc, x0, y0, x1, y1, z):
    """One straight alignment: representation, horizontal and vertical layout, start station."""
    length = math.hypot(x1 - x0, y1 - y0)
    dx, dy = (x1 - x0) / length, (y1 - y0) / length
    # geometry: a composite curve in plan and a gradient curve on top of it
    hpl = e(f"IFCAXIS2PLACEMENT2D({e(f'IFCCARTESIANPOINT(({f(mm(x0))},{f(mm(y0))}))')},{e(f'IFCDIRECTION(({f(dx)},{f(dy)}))')})")
    hcurve = e(f"IFCCOMPOSITECURVE(({e(f'IFCCURVESEGMENT(.DISCONTINUOUS.,{hpl},IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE({f(mm(length))}),{line2})')}),.F.)")
    vpl = e(f"IFCAXIS2PLACEMENT2D({e(f'IFCCARTESIANPOINT((0.,{f(mm(z))}))')},{d2})")
    vseg = e(f"IFCCURVESEGMENT(.DISCONTINUOUS.,{vpl},IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE({f(mm(length))}),{line2})")
    gcurve = e(f"IFCGRADIENTCURVE(({vseg}),.F.,{hcurve},$)")
    foot = e(f"IFCSHAPEREPRESENTATION({axis_ctx},'FootPrint','Curve2D',({hcurve}))")
    axis = e(f"IFCSHAPEREPRESENTATION({axis_ctx},'Axis','Curve3D',({gcurve}))")
    shape = e(f"IFCPRODUCTDEFINITIONSHAPE($,$,({foot},{axis}))")
    # semantics
    apl = e(f"IFCLOCALPLACEMENT({site_pl},{wcs})")
    aln = e(f"IFCALIGNMENT('{guid()}',{oh},'{name}','{desc}',$,{apl},{shape},.NOTDEFINED.)")
    e(f"IFCRELAGGREGATES('{guid()}',{oh},$,$,{proj},({aln}))")
    hz = e(f"IFCALIGNMENTHORIZONTAL('{guid()}',{oh},$,$,$,{apl},$)")
    vt = e(f"IFCALIGNMENTVERTICAL('{guid()}',{oh},$,$,$,{apl},$)")
    hpar = e(f"IFCALIGNMENTHORIZONTALSEGMENT($,$,{e(f'IFCCARTESIANPOINT(({f(mm(x0))},{f(mm(y0))}))')},{f(math.atan2(dy, dx))},0.,0.,{f(mm(length))},$,.LINE.)")
    hseg = e(f"IFCALIGNMENTSEGMENT('{guid()}',{oh},$,$,$,{apl},$,{hpar})")
    vpar = e(f"IFCALIGNMENTVERTICALSEGMENT($,$,0.,{f(mm(length))},{f(mm(z))},0.,0.,$,.CONSTANTGRADIENT.)")
    vsg = e(f"IFCALIGNMENTSEGMENT('{guid()}',{oh},$,$,$,{apl},$,{vpar})")
    e(f"IFCRELNESTS('{guid()}',{oh},$,$,{hz},({hseg}))")
    e(f"IFCRELNESTS('{guid()}',{oh},$,$,{vt},({vsg}))")
    ref = e(f"IFCREFERENT('{guid()}',{oh},'0+000',$,$,{e(f'IFCLOCALPLACEMENT({site_pl},{wcs})')},$,.STATION.)")
    e(f"IFCRELNESTS('{guid()}',{oh},$,$,{aln},({ref},{hz},{vt}))")
    station = e("IFCPROPERTYSINGLEVALUE('Station',$,IFCLENGTHMEASURE(0.),$)")
    ps = e(f"IFCPROPERTYSET('{guid()}',{oh},'Pset_Stationing',$,({station}))")
    e(f"IFCRELDEFINESBYPROPERTIES('{guid()}',{oh},$,$,({ref}),{ps})")
    return length


for a in ALIGNMENTS:
    print(f'{a[0]}: {alignment(*a):.3f} m')

HEAD = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [Alignment-basedReferenceView]'),'2;1');
FILE_NAME('Infra-Alignment.ifc','2026-11-14T00:00:00',('Vispecta'),('Vispecta'),'Vispecta sample generator','Vispecta','');
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
"""
with open(sys.argv[1], 'w') as out:
    out.write(HEAD + "\n".join(lines) + "\nENDSEC;\nEND-ISO-10303-21;\n")
print('entities', count[0])
