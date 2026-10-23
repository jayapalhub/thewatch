#!/usr/bin/env python3
"""Turn a city's research JSON into SQL chunks for D1.
usage: gen.py <slug>   -> writes <slug>_NN.sql files (each small enough for one D1 call) and prints a review."""
import json, re, sys, os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

D = os.environ.get("CITY_DATA", os.path.dirname(os.path.abspath(__file__)))
CITIES = {
 "chicago": dict(name="Chicago", region="Chicago and the collar counties", tz="America/Chicago", sort=100, state="Illinois",
   places="Chicago, Evanston, Schaumburg, Naperville, Oak Brook, Rosemont, Deerfield, Northbrook, Itasca, Downers Grove, Lombard, Lisle, Oakbrook Terrace, Hoffman Estates, Arlington Heights, Skokie, Des Plaines, Elk Grove, Riverwoods, Lake Forest, Northfield, Glenview, Warrenville, Aurora, Joliet, Hammond, Merrillville",
   geo="Chicago and the collar counties: Evanston, Schaumburg, Naperville, Oak Brook, Rosemont, Deerfield and the north and west suburbs, plus Northwest Indiana. Milwaukee is out of scope.",
   sweep_extra="Meetup search within 30 miles of Chicago; Eventbrite searches for Chicago, Schaumburg and Naperville; Luma for AI security meetups."),
 "dallas": dict(name="Dallas", region="Dallas, Fort Worth and North Texas", tz="America/Chicago", sort=110, state="Texas",
   places="Dallas, Fort Worth, Plano, Frisco, Irving, Las Colinas, Richardson, Arlington, Addison, Carrollton, Westlake, Southlake, McKinney, Allen, Coppell, Grapevine, Lewisville, Denton, Garland, Farmers Branch",
   geo="Dallas, Fort Worth, Plano, Frisco, Irving, Richardson, Arlington and the rest of DFW. Austin, Houston and San Antonio have their own calendars.",
   sweep_extra="Meetup search within 30 miles of Dallas; Eventbrite searches for Dallas, Plano, Irving and Fort Worth."),
 "austin": dict(name="Austin", region="Austin, San Antonio and Central Texas", tz="America/Chicago", sort=120, state="Texas",
   places="Austin, Round Rock, Cedar Park, Georgetown, San Marcos, Pflugerville, Leander, Kyle, San Antonio, New Braunfels, Schertz",
   geo="Austin, Round Rock, Cedar Park, Georgetown and San Marcos, plus San Antonio until it has its own calendar. Dallas and Houston have their own calendars.",
   sweep_extra="Meetup search within 30 miles of Austin and of San Antonio; Eventbrite searches for Austin and San Antonio; Luma for AI security meetups."),
 "houston": dict(name="Houston", region="Houston and the Gulf Coast", tz="America/Chicago", sort=130, state="Texas",
   places="Houston, The Woodlands, Sugar Land, Katy, Pearland, Spring, Humble, Pasadena, Conroe, League City, Clear Lake, Webster, Stafford, Missouri City",
   geo="Houston, The Woodlands, Sugar Land, Katy, Pearland and Clear Lake. Austin and Dallas have their own calendars.",
   sweep_extra="Meetup search within 30 miles of Houston; Eventbrite searches for Houston and The Woodlands. Energy sector OT and ICS security events belong here."),
 "atlanta": dict(name="Atlanta", region="Atlanta and North Georgia", tz="America/New_York", sort=140, state="Georgia",
   places="Atlanta, Alpharetta, Sandy Springs, Marietta, Roswell, Duluth, Norcross, Peachtree Corners, Dunwoody, Kennesaw, Johns Creek, Smyrna, Decatur, Lawrenceville, Buckhead, Midtown",
   geo="Atlanta, Alpharetta, Sandy Springs, Marietta, Roswell and the perimeter suburbs.",
   sweep_extra="Meetup search within 30 miles of Atlanta; Eventbrite searches for Atlanta and Alpharetta; Luma for AI security meetups."),
 "washington": dict(name="Washington DC", region="Washington DC, Northern Virginia and Maryland", tz="America/New_York", sort=150, state="Virginia",
   places="Washington, Arlington, Alexandria, McLean, Tysons, Reston, Herndon, Chantilly, Fairfax, Vienna, Falls Church, Ashburn, Sterling, Bethesda, Rockville, Gaithersburg, Columbia, Fort Meade, Annapolis Junction, Hanover, Linthicum, Baltimore, Laurel, Silver Spring",
   geo="The District, Arlington, Alexandria, Tysons, Reston, Herndon, Chantilly, Bethesda, Rockville, Columbia and Fort Meade, plus Baltimore until it has its own calendar.",
   sweep_extra="Meetup search within 30 miles of Washington; Eventbrite searches for Washington, Tysons, Reston and Columbia MD. Government and cleared events: list only those open to the public."),
 "newyork": dict(name="New York", region="New York City and the metro", tz="America/New_York", sort=160, state="New York",
   places="New York, Manhattan, Brooklyn, Queens, Bronx, Staten Island, Jersey City, Hoboken, Newark, Long Island City, Westchester, White Plains, Purchase, Stamford, Garden City, Melville, Uniondale, Morristown, Parsippany",
   geo="The five boroughs, Jersey City, Hoboken, Newark, Long Island and Westchester, plus Stamford.",
   sweep_extra="Meetup search within 20 miles of New York; Eventbrite searches for New York and Jersey City; Luma for AI security meetups, which are many in New York."),
 "boston": dict(name="Boston", region="Boston and New England", tz="America/New_York", sort=170, state="Massachusetts",
   places="Boston, Cambridge, Somerville, Waltham, Burlington, Lexington, Bedford, Woburn, Quincy, Newton, Needham, Marlborough, Framingham, Andover, Wilmington, Providence, Nashua, Manchester",
   geo="Boston, Cambridge, Waltham, Burlington, Lexington, Bedford and the 128 belt, plus Providence and southern New Hampshire.",
   sweep_extra="Meetup search within 30 miles of Boston; Eventbrite searches for Boston and Cambridge; Luma for AI security meetups."),
 "portland": dict(name="Portland", region="Portland and Oregon", tz="America/Los_Angeles", sort=180, state="Oregon",
   places="Portland, Beaverton, Hillsboro, Lake Oswego, Tigard, Tualatin, Wilsonville, Gresham, Vancouver, Salem",
   geo="Portland, Beaverton, Hillsboro, Lake Oswego and Vancouver, Washington, plus Salem. Seattle has its own calendar.",
   sweep_extra="Meetup search within 30 miles of Portland; Eventbrite searches for Portland and Hillsboro."),
 "saltlake": dict(name="Salt Lake City", region="Salt Lake City and the Wasatch Front", tz="America/Denver", sort=190, state="Utah",
   places="Salt Lake City, Lehi, Provo, Orem, Draper, Sandy, South Jordan, West Jordan, Murray, Midvale, Ogden, Layton, American Fork, Pleasant Grove, Cottonwood Heights",
   geo="Salt Lake City, Lehi, Provo, Orem, Draper, Sandy and Ogden, the whole Wasatch Front.",
   sweep_extra="Meetup search within 40 miles of Salt Lake City; Eventbrite searches for Salt Lake City and Lehi; Silicon Slopes events belong here."),
 "philadelphia": dict(name="Philadelphia", region="Philadelphia, the Main Line and Delaware Valley", tz="America/New_York", sort=200, state="Pennsylvania",
   places="Philadelphia, King of Prussia, Conshohocken, Malvern, Wayne, Radnor, Plymouth Meeting, Blue Bell, Horsham, Fort Washington, Wilmington, Newark DE, Cherry Hill, Camden, Mount Laurel, Princeton",
   geo="Philadelphia, King of Prussia, Conshohocken, Malvern, Wilmington DE, Cherry Hill and the South Jersey suburbs, plus Princeton. New York and Baltimore have their own calendars.",
   sweep_extra="Meetup search within 30 miles of Philadelphia; Eventbrite searches for Philadelphia, King of Prussia and Wilmington."),
 "minneapolis": dict(name="Minneapolis", region="Minneapolis, St. Paul and the Twin Cities", tz="America/Chicago", sort=210, state="Minnesota",
   places="Minneapolis, St. Paul, Saint Paul, Bloomington, Eden Prairie, Minnetonka, Plymouth, Edina, St. Louis Park, Eagan, Roseville, Maple Grove, Golden Valley, Arden Hills",
   geo="Minneapolis, St. Paul, Bloomington, Eden Prairie, Minnetonka, Plymouth and the Twin Cities suburbs.",
   sweep_extra="Meetup search within 30 miles of Minneapolis; Eventbrite searches for Minneapolis and St. Paul."),
 "detroit": dict(name="Detroit", region="Detroit, Ann Arbor and Southeast Michigan", tz="America/New_York", sort=220, state="Michigan",
   places="Detroit, Dearborn, Troy, Southfield, Auburn Hills, Ann Arbor, Novi, Farmington Hills, Livonia, Warren, Pontiac, Bloomfield Hills, Royal Oak, Ypsilanti",
   geo="Detroit, Dearborn, Troy, Southfield, Auburn Hills, Ann Arbor and Southeast Michigan.",
   sweep_extra="Meetup search within 30 miles of Detroit; Eventbrite searches for Detroit, Troy and Ann Arbor. Automotive product security events belong here."),
 "charlotte": dict(name="Charlotte", region="Charlotte and the Carolinas Piedmont", tz="America/New_York", sort=230, state="North Carolina",
   places="Charlotte, Fort Mill, Rock Hill, Concord, Gastonia, Matthews, Huntersville, Mooresville, Ballantyne",
   geo="Charlotte, Fort Mill, Rock Hill, Concord and Gastonia. Raleigh and Durham have their own calendar.",
   sweep_extra="Meetup search within 30 miles of Charlotte; Eventbrite searches for Charlotte. Banking security events belong here."),
 "raleigh": dict(name="Raleigh", region="Raleigh, Durham and the Research Triangle", tz="America/New_York", sort=240, state="North Carolina",
   places="Raleigh, Durham, Chapel Hill, Cary, Morrisville, Research Triangle Park, RTP, Apex, Wake Forest",
   geo="Raleigh, Durham, Chapel Hill, Cary, Morrisville and Research Triangle Park. Charlotte has its own calendar.",
   sweep_extra="Meetup search within 30 miles of Raleigh; Eventbrite searches for Raleigh and Durham."),
 "nashville": dict(name="Nashville", region="Nashville and Middle Tennessee", tz="America/Chicago", sort=250, state="Tennessee",
   places="Nashville, Franklin, Brentwood, Murfreesboro, Cool Springs, Hendersonville",
   geo="Nashville, Franklin, Brentwood and Murfreesboro.",
   sweep_extra="Meetup search within 30 miles of Nashville; Eventbrite searches for Nashville and Franklin. Healthcare security events belong here."),
 "tampa": dict(name="Tampa", region="Tampa Bay", tz="America/New_York", sort=260, state="Florida",
   places="Tampa, St. Petersburg, Saint Petersburg, Clearwater, Lakeland, Sarasota, Brandon, Largo, Wesley Chapel",
   geo="Tampa, St. Petersburg, Clearwater, Lakeland and Sarasota. MacDill Air Force Base and SOCOM events open to the public belong here.",
   sweep_extra="Meetup search within 30 miles of Tampa; Eventbrite searches for Tampa and St. Petersburg."),
 "miami": dict(name="Miami", region="Miami, Fort Lauderdale and South Florida", tz="America/New_York", sort=270, state="Florida",
   places="Miami, Fort Lauderdale, Boca Raton, West Palm Beach, Doral, Coral Gables, Sunrise, Plantation, Miramar, Hollywood, Weston",
   geo="Miami, Fort Lauderdale, Boca Raton and West Palm Beach.",
   sweep_extra="Meetup search within 30 miles of Miami and of Fort Lauderdale; Eventbrite searches for Miami, Fort Lauderdale and Boca Raton; Luma for AI security meetups."),
 "orlando": dict(name="Orlando", region="Orlando and Central Florida", tz="America/New_York", sort=280, state="Florida",
   places="Orlando, Lake Mary, Winter Park, Maitland, Sanford, Kissimmee, Melbourne, Palm Bay, Cocoa Beach",
   geo="Orlando, Lake Mary, Winter Park and Melbourne on the Space Coast. Tampa has its own calendar.",
   sweep_extra="Meetup search within 30 miles of Orlando; Eventbrite searches for Orlando and Melbourne. Simulation and defense events open to the public belong here."),
 "columbus": dict(name="Columbus", region="Columbus and Central Ohio", tz="America/New_York", sort=290, state="Ohio",
   places="Columbus, Dublin, Westerville, New Albany, Grove City, Worthington, Hilliard",
   geo="Columbus, Dublin, Westerville, New Albany and Grove City. Cincinnati and Cleveland have their own calendars.",
   sweep_extra="Meetup search within 30 miles of Columbus; Eventbrite searches for Columbus."),
 "cincinnati": dict(name="Cincinnati", region="Cincinnati, Dayton and Northern Kentucky", tz="America/New_York", sort=300, state="Ohio",
   places="Cincinnati, Mason, Blue Ash, West Chester, Covington, Florence, Erlanger, Dayton, Beavercreek, Fairborn",
   geo="Cincinnati, Mason, Blue Ash, Covington KY and Dayton, with Wright Patterson AFB events open to the public.",
   sweep_extra="Meetup search within 30 miles of Cincinnati and of Dayton; Eventbrite searches for Cincinnati and Dayton."),
 "cleveland": dict(name="Cleveland", region="Cleveland, Akron and Northeast Ohio", tz="America/New_York", sort=310, state="Ohio",
   places="Cleveland, Akron, Independence, Beachwood, Canton, Mayfield Heights, Westlake, Brecksville, Strongsville",
   geo="Cleveland, Akron, Independence, Beachwood and Canton.",
   sweep_extra="Meetup search within 30 miles of Cleveland; Eventbrite searches for Cleveland and Akron."),
 "pittsburgh": dict(name="Pittsburgh", region="Pittsburgh and Western Pennsylvania", tz="America/New_York", sort=320, state="Pennsylvania",
   places="Pittsburgh, Cranberry Township, Canonsburg, Monroeville, Wexford, Coraopolis",
   geo="Pittsburgh, Cranberry Township, Canonsburg and Monroeville. Carnegie Mellon and CERT public events belong here.",
   sweep_extra="Meetup search within 30 miles of Pittsburgh; Eventbrite searches for Pittsburgh."),
 "stlouis": dict(name="St. Louis", region="St. Louis and the Metro East", tz="America/Chicago", sort=330, state="Missouri",
   places="St. Louis, Saint Louis, Clayton, Chesterfield, O'Fallon, St. Charles, Creve Coeur, Maryland Heights, Scott AFB, Belleville, Edwardsville",
   geo="St. Louis, Clayton, Chesterfield, O'Fallon MO, Scott Air Force Base and the Metro East in Illinois.",
   sweep_extra="Meetup search within 30 miles of St. Louis; Eventbrite searches for St. Louis."),
 "kansascity": dict(name="Kansas City", region="Kansas City and Johnson County", tz="America/Chicago", sort=340, state="Missouri",
   places="Kansas City, Overland Park, Olathe, Leawood, Lenexa, Lee's Summit, North Kansas City, Shawnee",
   geo="Kansas City in Missouri and Kansas, Overland Park, Olathe, Leawood and Lenexa.",
   sweep_extra="Meetup search within 30 miles of Kansas City; Eventbrite searches for Kansas City and Overland Park."),
 "indianapolis": dict(name="Indianapolis", region="Indianapolis and Central Indiana", tz="America/Indiana/Indianapolis", sort=350, state="Indiana",
   places="Indianapolis, Carmel, Fishers, Noblesville, Plainfield, Zionsville, Greenwood",
   geo="Indianapolis, Carmel, Fishers, Noblesville and Plainfield.",
   sweep_extra="Meetup search within 30 miles of Indianapolis; Eventbrite searches for Indianapolis."),
 "milwaukee": dict(name="Milwaukee", region="Milwaukee, Madison and Southeast Wisconsin", tz="America/Chicago", sort=360, state="Wisconsin",
   places="Milwaukee, Waukesha, Brookfield, Menomonee Falls, Wauwatosa, Pewaukee, Glendale, Madison, Verona",
   geo="Milwaukee, Waukesha, Brookfield, Menomonee Falls and Madison. Chicago has its own calendar.",
   sweep_extra="Meetup search within 30 miles of Milwaukee and of Madison; Eventbrite searches for Milwaukee and Madison."),
 "sacramento": dict(name="Sacramento", region="Sacramento and the Capital Region", tz="America/Los_Angeles", sort=370, state="California",
   places="Sacramento, Roseville, Folsom, Rancho Cordova, Davis, Elk Grove, West Sacramento, El Dorado Hills",
   geo="Sacramento, Roseville, Folsom, Rancho Cordova and Davis. The Bay Area belongs to San Jose and San Francisco. State government security events open to the public belong here.",
   sweep_extra="Meetup search within 30 miles of Sacramento; Eventbrite searches for Sacramento."),
 "sanantonio": dict(name="San Antonio", region="San Antonio and South Texas", tz="America/Chicago", sort=380, state="Texas",
   places="San Antonio, New Braunfels, Schertz, Universal City, Port San Antonio, Lackland, Boerne",
   geo="San Antonio, New Braunfels, Schertz and Port San Antonio, with JBSA and the military cyber community. Austin has its own calendar.",
   sweep_extra="Meetup search within 30 miles of San Antonio; Eventbrite searches for San Antonio."),
 "baltimore": dict(name="Baltimore", region="Baltimore, Fort Meade and Central Maryland", tz="America/New_York", sort=390, state="Maryland",
   places="Baltimore, Columbia, Fort Meade, Annapolis Junction, Hanover, Linthicum, Towson, Annapolis, Ellicott City, Odenton, Severn, Glen Burnie, Owings Mills, Hunt Valley",
   geo="Baltimore, Columbia, Fort Meade, Annapolis Junction, Hanover, Linthicum, Towson and Annapolis. Washington DC, Northern Virginia, Bethesda and Rockville belong to the Washington calendar.",
   sweep_extra="Meetup search within 30 miles of Baltimore; Eventbrite searches for Baltimore and Columbia MD."),
 "richmond": dict(name="Richmond", region="Richmond and Central Virginia", tz="America/New_York", sort=400, state="Virginia",
   places="Richmond, Glen Allen, Henrico, Chesterfield, Midlothian, Short Pump, Charlottesville",
   geo="Richmond, Glen Allen, Henrico, Chesterfield and Charlottesville. Northern Virginia belongs to the Washington calendar.",
   sweep_extra="Meetup search within 30 miles of Richmond; Eventbrite searches for Richmond and Charlottesville."),
}
TOPIC_MAP = {"grc":"grc","ai_security":"ai","ai":"ai","appsec":"appsec","cloud":"cloud","threat_intel":"threat_intel","privacy":"privacy","audit":"audit",
  "identity":"identity","careers":"careers","networking":"social","social":"social","leadership":"leadership","ot_ics":"network","network":"network","tech":"tech"}
AGGREGATORS = re.compile(r"allevents|10times|infosec-conferences|sharedaudiences|showsbee|luminik|govevents|accrue\.com|cybersecurityventures|conferenceindex|eventbrite\.com/d/|eventbrite\.com/b/|meetup\.com/find|happeningnext|eventective|stayhappening|cvent\.com/c/calendar|techmeme", re.I)
ORG_TYPES = {"chapter","meetup","conference","vendor","university","government","community","media","employer"}
EXISTING_TOURING = {"cyberrisk-alliance","futurecon","secureworld","evanta","eds-x-series","sans","gartner-conferences","hmg-strategy","f2f-events","elevateit","ciomeet","owasp-foundation","executive-womens-forum","data-connectors","ians","gpsec"}

def q(v):
    if v is None or v == "": return "NULL"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def clean(s):  # Jerome's writing rules in anything shown on the site
    s = str(s or "").strip()
    s = s.replace("—", ", ").replace("–", " to ").replace("...", ".").replace("…", ".")
    s = re.sub(r"\s+-\s+", ", ", s)
    s = re.sub(r"\b(genuinely|honestly|actually)\s+", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()

def slugify(s): return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(s).lower())).strip("-")

def cost_fields(c):
    c = str(c or "").strip(); lc = c.lower()
    nums = [float(x.replace(",", "")) for x in re.findall(r"\$\s?([\d,]+(?:\.\d+)?)", c)]
    if not c: return "unknown", None, None, None
    if re.search(r"\bfree\b|no cost|complimentary|\$0\b", lc) and not nums: return "free", 0, 0, clean(c) if len(c) > 6 else None
    if re.search(r"free for members|members free|free to members", lc): return "members_free", 0, max(nums) if nums else None, clean(c)
    if nums: return "paid", min(nums), max(nums), clean(c)
    if re.search(r"\bfree\b", lc): return "free", 0, 0, clean(c)
    return "unknown", None, None, clean(c)

def cpe_fields(c):
    c = str(c or "").strip()
    if not c or re.match(r"(?i)^(not stated|none|n/?a|unknown)", c): return None, None, None, None
    h = re.search(r"(\d+(?:\.\d+)?)\s*(?:cpe|hour)", c, re.I)
    body = "ISACA" if "isaca" in c.lower() else "ISC2" if "isc2" in c.lower() else "IIA" if "iia" in c.lower() else "IAPP" if "iapp" in c.lower() else "self_reported"
    return 1, float(h.group(1)) if h else None, body, clean(c)

def times(ev, tz):
    d = ev.get("date"); st = (ev.get("start_time") or "").strip(); et = (ev.get("end_time") or "").strip()
    ed = ev.get("end_date") or d
    placeholder = not st
    st = st or "09:00"; et = et or ("17:00" if placeholder else "")
    s = datetime.fromisoformat(f"{d}T{st}")
    e = datetime.fromisoformat(f"{ed}T{et}") if et else s + timedelta(hours=2)
    if e <= s: e = s + timedelta(hours=2)
    z = ZoneInfo(tz)
    su = s.replace(tzinfo=z).astimezone(ZoneInfo("UTC")); eu = e.replace(tzinfo=z).astimezone(ZoneInfo("UTC"))
    f = lambda x: x.strftime("%Y-%m-%dT%H:%M:00"); fu = lambda x: x.strftime("%Y-%m-%dT%H:%M:00.000Z")
    return f(s), f(e), fu(su), fu(eu), placeholder

def main(slug):
    C = CITIES[slug]; out = []; review = []
    import glob
    orgs, events = [], []
    for fp in sorted(glob.glob(f"{D}/{slug}_events*.json")):
        ev = json.load(open(fp)); have = {slugify(o.get("slug") or o.get("name")) for o in orgs}
        orgs += [o for o in ev.get("organizers", []) if slugify(o.get("slug") or o.get("name")) not in have]
        events += ev.get("events", [])
    # 1. city row
    out.append(f"INSERT OR IGNORE INTO cities (slug, name, title, region, timezone, description, empty_copy, sweep_notes, newsletter, active, sort) VALUES ({q(slug)}, {q(C['name'])}, {q('The Watch ' + C['name'])}, {q(C['region'])}, {q(C['tz'])}, "
      f"{q('Every cybersecurity, AI security, privacy and audit event in ' + C['region'] + ', in one calendar.')}, "
      f"{q('The ' + C['name'] + ' calendar is new and filling up. Organizers can submit events and they appear here once approved.')}, "
      f"{q('Geography: ' + C['geo'] + ' ' + C['sweep_extra'] + ' Scope includes adjacent tech and IT leadership events (AI and developer conferences, CIO and IT leadership gatherings, cloud and platform events) tagged with the tech topic; they publish like any other row.')}, 'sunday', 1, {C['sort']});")
    # 2. organizations
    org_sql = []; slugs = set()
    for o in orgs:
        s = slugify(o.get("slug") or o.get("name")); o["slug"] = s; slugs.add(s)
        for k in ("website", "events_url"):
            if AGGREGATORS.search(o.get(k) or "") or re.search(r"infosec-conferences|sharedaudiences|showsbee|luminik|govevents|accrue\.com", o.get(k) or ""): o[k] = ""
        if s in EXISTING_TOURING: continue
        t = o.get("type") if o.get("type") in ORG_TYPES else "community"
        notes = "Research 2026-10-22." + ("" if o.get("active", True) else " Looked inactive at launch: no event in the last twelve months.")
        org_sql.append(f"INSERT OR IGNORE INTO organizations (slug, name, type, website, events_url, description, usual_cadence_text, default_city, cpe_notes, default_venue_name, default_venue_address, notes) VALUES "
          f"({q(s)}, {q(clean(o.get('name')))}, {q(t)}, {q(o.get('website'))}, {q(o.get('events_url'))}, {q(clean(o.get('description')))}, {q(clean(o.get('cadence'))[:200])}, {q(slug)}, {q(clean(o.get('cpe_notes'))[:300])}, {q(clean(o.get('default_venue_name')))}, {q(clean(o.get('default_venue_address')))}, {q(notes)});")
    out += org_sql
    # new touring slugs from the brief
    for s, n, w in [("data-connectors", "Data Connectors", "https://www.dataconnectors.com"), ("ians", "IANS Research", "https://www.iansresearch.com"), ("gpsec", "GPSEC", "https://www.gpsec.org")]:
        out.append(f"INSERT OR IGNORE INTO organizations (slug, name, type, website, default_city) VALUES ({q(s)}, {q(n)}, 'conference', {q(w)}, 'virtual');")
    # 3. feeds and 4. sweep targets
    feeds = []; targets = []
    for o in orgs:
        if o["slug"] in EXISTING_TOURING: continue
        oid = f"(SELECT id FROM organizations WHERE slug={q(o['slug'])})"
        topics = json.dumps(["threat_intel"])
        broad = o.get("type") in ("community", "meetup") and not re.search(r"secur|owasp|hack|2600|def ?con|dc\d{3}|cyber|privacy|isaca|isc2|issa", (o.get("name") or "") + " " + (o.get("description") or ""), re.I)
        kw = "title: security, cyber, privacy, governance, risk, compliance, hack, CTF, trust, safety" if broad else None
        cpe = 1 if re.search(r"isaca|isc2|issa|iia|iapp", o["slug"]) else 0
        url = None
        if (o.get("luma_calendar_id") or "").startswith("cal-"):
            url = f"https://api.lu.ma/ics/get?entity=calendar&id={o['luma_calendar_id']}"; nm = f"{clean(o['name'])} (Luma)"
        elif isinstance(o.get("meetup_slug"), str) and o.get("meetup_slug"):
            ms = re.sub(r"^https?://(www\.)?meetup\.com/|/.*$", "", o["meetup_slug"].strip("/"))
            url = f"https://www.meetup.com/{ms}/events/ical/"; nm = f"{clean(o['name'])} (Meetup iCal)"
        if url and o.get("active", True):
            feeds.append(f"INSERT INTO feed_sources (name, kind, url, organization_id, city, timezone, cpe_default, topics, keywords, notes) SELECT {q(nm)}, 'ical', {q(url)}, {oid}, {q(slug)}, {q(C['tz'])}, {cpe}, {q(topics)}, {q(kw)}, 'Added at the {C['name']} launch, 2026-10-22' WHERE NOT EXISTS (SELECT 1 FROM feed_sources WHERE url={q(url)});")
        tnotes = clean("; ".join(x for x in [o.get("cadence"), o.get("notes") if len(o.get("notes") or "") < 160 else ""] if x))[:300]
        if not o.get("active", True): tnotes = ("Looked inactive at launch. " + tnotes)[:300]
        has_feed = 1 if url and o.get("active", True) else 0
        targets.append(f"INSERT INTO sweep_targets (city, kind, name, url, notes, has_feed, feed_source_id) VALUES ({q(slug)}, 'organizer', {q(clean(o['name']))}, {q(o.get('events_url') or o.get('website'))}, {q(tnotes)}, {has_feed}, " + (f"(SELECT id FROM feed_sources WHERE url={q(url)})" if has_feed else "NULL") + ");")
    city_short = C['name'].split()[0]
    targets += [
      f"INSERT INTO sweep_targets (city, kind, name, url) VALUES ({q(slug)}, 'search', {q('Meetup search: cybersecurity near ' + C['name'])}, {q('https://www.meetup.com/find/?keywords=cybersecurity&location=' + C['name'].replace(' ', '%20') + '&source=EVENTS')});",
      f"INSERT INTO sweep_targets (city, kind, name) VALUES ({q(slug)}, 'search', {q('Eventbrite search: cybersecurity, information security, privacy and GRC in ' + C['name'])});",
      f"INSERT INTO sweep_targets (city, kind, name, url) VALUES ({q(slug)}, 'search', {q('Luma search: security and AI events in ' + C['name'])}, {q('https://luma.com/' + slugify(city_short))});",
      f"INSERT INTO sweep_targets (city, kind, name, notes) VALUES ({q(slug)}, 'search', {q('Vendor field events in ' + C['name'])}, 'Wiz, CrowdStrike, Palo Alto Networks, Zscaler, Okta, AWS, Google Cloud, Optiv, GuidePoint and local vendors');",
      f"INSERT INTO sweep_targets (city, kind, name, url, notes) VALUES ({q(slug)}, 'search', {q('Touring conferences in ' + C['name'])}, 'https://www.secureworld.io/events', 'SecureWorld, FutureCon, Official Cybersecurity Summit, Data Connectors, Evanta, CISO XC, IANS, SANS: check for new {C['name']} dates');",
    ]
    def dedupe_target(st):
        m = re.match(r"INSERT INTO sweep_targets \((.*?)\) VALUES \((.*)\);$", st, re.S)
        cols, vals = m.group(1), m.group(2)
        name = re.search(r"'search', ('(?:[^']|'')*')|'organizer', ('(?:[^']|'')*')", vals); nm = name.group(1) or name.group(2)
        return f"INSERT INTO sweep_targets ({cols}) SELECT {vals} WHERE NOT EXISTS (SELECT 1 FROM sweep_targets WHERE city={q(slug)} AND name={nm});"
    targets = [dedupe_target(t) for t in targets]
    out += feeds + targets
    # 5. events
    seen = set(); n_pub = n_hold = n_skip = 0
    for e in events:
        try:
            d = e.get("date") or ""
            if not ("2026-10-23" <= d <= "2027-04-30"): n_skip += 1; review.append(f"SKIP out of window: {e.get('title')} {d}"); continue
            reg = e.get("registration_url") or ""; src = e.get("source_url") or reg
            if not reg.startswith("http"): n_skip += 1; review.append(f"SKIP no url: {e.get('title')}"); continue
            title = clean(e.get("title"))[:140]
            key = (title.lower(), d)
            if key in seen: continue
            seen.add(key)
            s_at, e_at, su, eu, ph = times(e, C["tz"])
            fmt = e.get("format") if e.get("format") in ("in_person", "virtual", "hybrid") else "in_person"
            ct, cmin, cmax, cnotes = cost_fields(e.get("cost"))
            cpe, cpeh, cpeb, cpen = cpe_fields(e.get("cpe"))
            tp = [TOPIC_MAP[t] for t in (e.get("topics") or []) if t in TOPIC_MAP] or ["threat_intel"]
            tp = list(dict.fromkeys(tp))[:4]
            vn = clean(e.get("venue_name")); va = clean(e.get("venue_address"))
            reasons = []
            if AGGREGATORS.search(reg): reasons.append("the registration link is an aggregator page")
            if AGGREGATORS.search(src) and src != reg: reasons.append("the date was seen on an aggregator page, not the organizer's own")
            if e.get("confidence") != "high": reasons.append("research confidence was medium")
            if fmt != "virtual" and (not vn or re.search(r"\b(tbd|tba|to be announced|not (named|stated|listed|announced))\b", vn, re.I)):
                if re.search(r"registered|registrants|after registration|attendees", vn, re.I): pass
                else: reasons.append("the venue is not announced yet")
            if fmt == "virtual": vn, va = (vn or "Online"), "Virtual"
            hold = 1 if reasons else 0
            notes = f"Research 2026-10-22 from {src}." + (" Times are placeholders; the page gives no time." if ph else "") + (f" Held: {', and '.join(reasons)}." if hold else " Publishes automatically in 24 hours unless held or rejected.")
            if e.get("notes"): notes += " Research note: " + clean(e["notes"])[:300]
            oslug = slugify(e.get("organizer_slug") or "")
            oid = f"(SELECT id FROM organizations WHERE slug={q(oslug)})" if oslug else "NULL"
            es = f"{slugify(title)[:80].strip('-')}-{d}"
            aud = "senior" if re.search(r"ciso|executive|leadership summit|evanta|cxo|c-suite", title, re.I) else "practitioner" if cpe else "open"
            out.append("INSERT OR IGNORE INTO events (slug, city, title, organization_id, venue_name, venue_address, start_at, end_at, start_utc, end_utc, timezone, format, description_short, description_long, registration_url, cost_type, cost_min, cost_max, cost_notes, cpe_eligible, cpe_hours, cpe_body, cpe_notes, topics, audience_level, status, source, source_url, reviewer_notes, hold, auto_publish_at) VALUES ("
              + ", ".join([q(es), q(slug), q(title), oid, q(vn), q(va), q(s_at), q(e_at), q(su), q(eu), q(C["tz"]), q(fmt), q(clean(e.get("description")).split(". ")[0][:200]), q(clean(e.get("description"))[:2000]), q(reg),
                 q(ct), q(cmin), q(cmax), q(cnotes), q(cpe), q(cpeh), q(cpeb), q(cpen), q(json.dumps(tp)), q(aud), "'pending_review'", "'research'", q(src), q(notes), str(hold), "NULL" if hold else "datetime('now','+1 day')"]) + ");")
            if hold: n_hold += 1; review.append(f"HOLD {d} {title}: {'; '.join(reasons)}")
            else: n_pub += 1
            if oslug and oslug not in slugs and oslug not in EXISTING_TOURING and oslug not in ("data-connectors", "ians", "gpsec"): review.append(f"WARN organizer slug not in this file (may exist already): {oslug} for {title}")
        except Exception as ex:
            n_skip += 1; review.append(f"SKIP error {ex}: {e.get('title')}")
    # 6. boards
    boards_path = f"{D}/{slug}_boards.json"; n_b = 0; unsupported = []
    if os.path.exists(boards_path):
        bd = json.load(open(boards_path)); bd = bd.get("employers", bd) if isinstance(bd, dict) else bd
        for b in bd:
            k = b.get("kind"); name = clean(b.get("employer")); bs = slugify(b.get("slug") or name)
            if k == "icims" and str((b.get("config") or {}).get("host", "")).endswith("icims.com"): k = "unsupported"  # hosted iCIMS portals 404 on our adapter
            if k == "lever" and "jobs.eu.lever.co" in (b.get("careers_url") or ""): b.setdefault("config", {})["region"] = "eu"
            if k in ("unsupported", None, ""): unsupported.append(name); continue
            if k != "existing":
                out.append(f"INSERT OR IGNORE INTO organizations (slug, name, type, website, description, default_city) VALUES ({q(bs)}, {q(name)}, 'employer', {q(b.get('website'))}, {q(clean(b.get('description')))}, {q(slug)});")
            if k == "existing":
                out.append(f"INSERT INTO job_sources (city, organization_id, employer_name, kind, config, location_terms, search_text, notes) SELECT {q(slug)}, organization_id, employer_name, kind, CASE WHEN kind='phenom' THEN json_set(config, '$.state', {q(C['state'])}) ELSE config END, {q(C['places'])}, 'security', 'Second city row added at the {C['name']} launch' FROM job_sources WHERE (lower(employer_name)=lower({q(name)}) OR organization_id=(SELECT id FROM organizations WHERE slug={q(bs)})) AND NOT EXISTS (SELECT 1 FROM job_sources j2 WHERE j2.city={q(slug)} AND (lower(j2.employer_name)=lower({q(name)}) OR j2.employer_name=job_sources.employer_name)) ORDER BY id LIMIT 1;")
            else:
                cfg = dict(b.get("config") or {})
                if k == "phenom": cfg.setdefault("path", "us/en"); cfg["state"] = cfg.get("state") or C["state"]
                if k == "successfactors": cfg.setdefault("base", "/")
                out.append(f"INSERT INTO job_sources (city, organization_id, employer_name, kind, config, location_terms, search_text, notes) SELECT {q(slug)}, (SELECT id FROM organizations WHERE slug={q(bs)}), {q(name)}, {q(k)}, {q(json.dumps(cfg))}, {q(C['places'])}, 'security', {q('Added at the ' + C['name'] + ' launch. ' + clean(b.get('notes'))[:200])} WHERE NOT EXISTS (SELECT 1 FROM job_sources WHERE city={q(slug)} AND lower(employer_name)=lower({q(name)}));")
            n_b += 1
    # chunk
    for f in os.listdir(D):
        if re.match(rf"{slug}_\d\d\.sql$", f): os.remove(f"{D}/{f}")
    chunk, size, i = [], 0, 0
    for st in out:
        if size + len(st) > 30000 and chunk:
            open(f"{D}/{slug}_{i:02d}.sql", "w").write("\n".join(chunk)); i += 1; chunk, size = [], 0
        chunk.append(st); size += len(st)
    if chunk: open(f"{D}/{slug}_{i:02d}.sql", "w").write("\n".join(chunk)); i += 1
    print(f"{slug}: {len(orgs)} organizers, {len(feeds)} feeds, {len(targets)} targets, {n_pub} events to publish, {n_hold} held, {n_skip} skipped, {n_b} boards, unsupported: {', '.join(unsupported) or 'none'}; {i} sql chunks")
    for r in review: print("  " + r)

if __name__ == "__main__": main(sys.argv[1])
