"""Writes public/samples/simple-scene/Infra-Alignment.ifc (python3 scripts/make-sample-alignment.py <out>): an IFC 4.3 alignment along the centre line of the track in
buildingSMART's Simple-Scene (Infra-Rail.ifc). Same units (mm) and map conversion as the scene,
so it lies on the track. Straight, 40 m, top of rail level, stations 0+000 to 0+040."""
import math, random, string, sys

random.seed(20261114)  # stable GUIDs
CH = string.digits + string.ascii_uppercase + string.ascii_lowercase + '_$'
def guid():
    return random.choice('0123') + ''.join(random.choice(CH) for _ in range(21))

# centre line measured from the rails of Infra-Rail.ifc (metres): see the PR / railgeom
X0, Y0, X1, Y1, Z = 8.660, 55.000, 43.302, 35.000, 7.775
L = math.hypot(X1 - X0, Y1 - Y0)
dirx, diry = (X1 - X0) / L, (Y1 - Y0) / L
ang = math.atan2(diry, dirx)
mm = lambda v: v * 1000.0
f = lambda v: repr(float(round(v, 6)))

lines = []
n = [0]
def e(s):
    n[0] += 1; lines.append(f"#{n[0]}={s};"); return f"#{n[0]}"

org = e("IFCORGANIZATION($,'Vispecta','Sample alignment for the buildingSMART IFC 4.3 Simple-Scene',$,$)")
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
proj = e(f"IFCPROJECT('{guid()}',{oh},'Vispecta sample alignment','Alignment along the track of the buildingSMART IFC 4.3 Simple-Scene',$,$,$,({ctx}),{units})")
crsu = e("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
crs = e(f"IFCPROJECTEDCRS('EPSG:32760','EPSG:32760 - WGS 84 / UTM zone 60S','WGS 84',$,$,$,{crsu})")
e(f"IFCMAPCONVERSION({ctx},{crs},729011.2258823584,9063960.607644705,0.,1.,0.,0.001)")
site_pl = e(f"IFCLOCALPLACEMENT($,{wcs})")
site = e(f"IFCSITE('{guid()}',{oh},'environment - site','Sample scene site',$,{site_pl},$,$,.ELEMENT.,$,$,0.,$,$)")
e(f"IFCRELAGGREGATES('{guid()}',{oh},$,$,{proj},({site}))")

# --- geometry (representation): horizontal composite curve and gradient curve, both straight
o2 = e("IFCCARTESIANPOINT((0.,0.))"); d2 = e("IFCDIRECTION((1.,0.))")
vec = e(f"IFCVECTOR({d2},1.)")
line2 = e(f"IFCLINE({o2},{vec})")
hp = e(f"IFCCARTESIANPOINT(({f(mm(X0))},{f(mm(Y0))}))"); hd = e(f"IFCDIRECTION(({f(dirx)},{f(diry)}))")
hpl = e(f"IFCAXIS2PLACEMENT2D({hp},{hd})")
hseg = e(f"IFCCURVESEGMENT(.DISCONTINUOUS.,{hpl},IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE({f(mm(L))}),{line2})")
hcurve = e(f"IFCCOMPOSITECURVE(({hseg}),.F.)")
vp = e(f"IFCCARTESIANPOINT((0.,{f(mm(Z))}))"); vd = e("IFCDIRECTION((1.,0.))")
vpl = e(f"IFCAXIS2PLACEMENT2D({vp},{vd})")
vseg = e(f"IFCCURVESEGMENT(.DISCONTINUOUS.,{vpl},IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE({f(mm(L))}),{line2})")
gcurve = e(f"IFCGRADIENTCURVE(({vseg}),.F.,{hcurve},$)")
r_foot = e(f"IFCSHAPEREPRESENTATION({axis_ctx},'FootPrint','Curve2D',({hcurve}))")
r_axis = e(f"IFCSHAPEREPRESENTATION({axis_ctx},'Axis','Curve3D',({gcurve}))")
pds = e(f"IFCPRODUCTDEFINITIONSHAPE($,$,({r_foot},{r_axis}))")

# --- semantics: alignment, horizontal (one LINE), vertical (one CONSTANTGRADIENT)
apl = e(f"IFCLOCALPLACEMENT({site_pl},{wcs})")
aln = e(f"IFCALIGNMENT('{guid()}',{oh},'Track','Centre line of the rail track in the sample scene',$,{apl},{pds},.NOTDEFINED.)")
e(f"IFCRELAGGREGATES('{guid()}',{oh},$,$,{proj},({aln}))")
hz = e(f"IFCALIGNMENTHORIZONTAL('{guid()}',{oh},$,$,$,{apl},$)")
vt = e(f"IFCALIGNMENTVERTICAL('{guid()}',{oh},$,$,$,{apl},$)")
sp = e(f"IFCCARTESIANPOINT(({f(mm(X0))},{f(mm(Y0))}))")
hparams = e(f"IFCALIGNMENTHORIZONTALSEGMENT($,$,{sp},{f(ang)},0.,0.,{f(mm(L))},$,.LINE.)")
hsegment = e(f"IFCALIGNMENTSEGMENT('{guid()}',{oh},$,$,$,{apl},$,{hparams})")
vparams = e(f"IFCALIGNMENTVERTICALSEGMENT($,$,0.,{f(mm(L))},{f(mm(Z))},0.,0.,$,.CONSTANTGRADIENT.)")
vsegment = e(f"IFCALIGNMENTSEGMENT('{guid()}',{oh},$,$,$,{apl},$,{vparams})")
e(f"IFCRELNESTS('{guid()}',{oh},$,$,{hz},({hsegment}))")
e(f"IFCRELNESTS('{guid()}',{oh},$,$,{vt},({vsegment}))")
# start station 0+000 as a referent at the start of the alignment
rpl = e(f"IFCLOCALPLACEMENT({site_pl},{wcs})")
ref = e(f"IFCREFERENT('{guid()}',{oh},'0+000',$,$,{rpl},$,.STATION.)")
e(f"IFCRELNESTS('{guid()}',{oh},$,$,{aln},({ref},{hz},{vt}))")
st = e("IFCPROPERTYSINGLEVALUE('Station',$,IFCLENGTHMEASURE(0.),$)")
ps = e(f"IFCPROPERTYSET('{guid()}',{oh},'Pset_Stationing',$,({st}))")
e(f"IFCRELDEFINESBYPROPERTIES('{guid()}',{oh},$,$,({ref}),{ps})")

head = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [Alignment-basedReferenceView]'),'2;1');
FILE_NAME('Infra-Alignment.ifc','2026-11-14T00:00:00',('Vispecta'),('Vispecta'),'Vispecta sample generator','Vispecta','');
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
"""
open(sys.argv[1], 'w').write(head + "\n".join(lines) + "\nENDSEC;\nEND-ISO-10303-21;\n")
print('length', round(L, 3), 'angle deg', round(math.degrees(ang), 3), 'entities', n[0])
