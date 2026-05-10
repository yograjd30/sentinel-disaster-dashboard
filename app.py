import os
import base64
from flask import Flask, jsonify, request, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

# Database Configuration — use /tmp on Vercel (read-only fs), local dir otherwise
IS_VERCEL = os.environ.get('VERCEL', False)
if IS_VERCEL:
    DB_PATH = '/tmp/sentinel.db'
else:
    basedir = os.path.abspath(os.path.dirname(__name__))
    DB_PATH = os.path.join(basedir, 'sentinel.db')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + DB_PATH
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Models
class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(20), nullable=False) # 'high', 'medium', 'low'
    location = db.Column(db.String(100), nullable=False)
    time = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text, nullable=True)

class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False) # 'medical', 'rescue', 'supplies', 'personnel'
    status = db.Column(db.String(50), nullable=False) # 'available', 'deployed', 'maintenance'
    location = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

class Weather(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    region = db.Column(db.String(100), nullable=False)
    condition = db.Column(db.String(50), nullable=False)
    temperature = db.Column(db.String(20), nullable=False)
    wind_speed = db.Column(db.String(20), nullable=False)
    precipitation = db.Column(db.String(20), nullable=False)

class Incident(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    type = db.Column(db.String(50), nullable=False)
    severity = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(200), nullable=False)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False) # 'admin', 'citizen', 'rescue'

class FieldReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    author_name = db.Column(db.String(50), nullable=False)
    author_role = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text, nullable=False)
    location = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.String(50), nullable=False)
    risk_percentage = db.Column(db.Integer, nullable=True)

class Depot(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    location_coords = db.Column(db.String(50), nullable=False)
    food = db.Column(db.Integer, nullable=False)
    water = db.Column(db.Integer, nullable=False)
    medical = db.Column(db.Integer, nullable=False)
    teams = db.Column(db.Integer, nullable=False)

class MissingPerson(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    age = db.Column(db.Integer, nullable=False)  # lower age = higher priority
    gender = db.Column(db.String(20), nullable=True)
    last_seen_location = db.Column(db.String(200), nullable=False)
    last_seen_time = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    reporter_name = db.Column(db.String(100), nullable=False)
    reporter_phone = db.Column(db.String(30), nullable=True)
    photo_data = db.Column(db.Text, nullable=True)  # base64 encoded image
    status = db.Column(db.String(20), nullable=False, default='missing')  # 'missing', 'found'
    submitted_at = db.Column(db.String(50), nullable=False)


# Initialize Database
with app.app_context():
    db.create_all()
    if User.query.count() == 0:
        users = [
            User(username='admin', password='123', role='admin'),
            User(username='citizen', password='123', role='citizen'),
            User(username='rescue', password='123', role='rescue')
        ]
        db.session.bulk_save_objects(users)

    # Seed data if empty
    if Alert.query.count() == 0:
        alerts = [
            Alert(title="Cyclone Warning", severity="high", location="Mumbai", time="10 mins ago", description="Category 4 cyclone approaching. Immediate evacuation required."),
            Alert(title="Flood Alert", severity="high", location="Chennai", time="1 hour ago", description="Water levels exceeded danger mark. Prepare for flooding."),
            Alert(title="Heavy Rainfall", severity="medium", location="Delhi", time="2 hours ago", description="Expected 150mm rainfall in next 24hrs.")
        ]
        db.session.bulk_save_objects(alerts)
        
        resources = [
            Resource(name="NDRF Team Alpha", type="rescue", status="available", location="North Command Depot", quantity=45),
            Resource(name="Medical Kit Batch 1", type="medical", status="deployed", location="South Command Depot", quantity=200),
            Resource(name="Ambulance Fleet", type="medical", status="available", location="East Command Depot", quantity=15),
            Resource(name="Food Rations", type="supplies", status="available", location="West Command Depot", quantity=5000),
            Resource(name="Rescue Boats", type="rescue", status="deployed", location="Central Command Depot", quantity=8),
            Resource(name="NDRF Team Beta", type="rescue", status="available", location="South Command Depot", quantity=30),
            Resource(name="Field Hospital", type="medical", status="available", location="North Command Depot", quantity=2)
        ]
        db.session.bulk_save_objects(resources)
        
        weather_data = [
            Weather(region="Mumbai", condition="Stormy", temperature="28°C", wind_speed="65 km/h", precipitation="120 mm"),
            Weather(region="Delhi", condition="Cloudy", temperature="32°C", wind_speed="15 km/h", precipitation="10 mm"),
            Weather(region="Chennai", condition="Rain", temperature="30°C", wind_speed="40 km/h", precipitation="85 mm"),
            Weather(region="Kolkata", condition="Thunderstorm", temperature="29°C", wind_speed="50 km/h", precipitation="95 mm"),
            Weather(region="Bengaluru", condition="Clear", temperature="25°C", wind_speed="10 km/h", precipitation="0 mm"),
            Weather(region="Hyderabad", condition="Rain", temperature="27°C", wind_speed="25 km/h", precipitation="40 mm")
        ]
        db.session.bulk_save_objects(weather_data)
        
        incidents = [
            Incident(lat=19.0760, lng=72.8777, type="flood", severity="high", description="Severe flooding in low-lying areas"),
            Incident(lat=18.5204, lng=73.8567, type="landslide", severity="medium", description="Minor landslide blocking road"),
            Incident(lat=15.2993, lng=74.1240, type="cyclone", severity="high", description="Cyclone landfall point")
        ]
        db.session.bulk_save_objects(incidents)
        db.session.commit()
        
    if Depot.query.count() == 0:
        depots = [
            Depot(id='west', name='WEST COMMAND DEPOT', location_coords='19.20, 72.95', food=12000, water=24000, medical=1800, teams=14),
            Depot(id='south', name='SOUTH RELIEF HUB', location_coords='13.10, 80.30', food=9500, water=18000, medical=1400, teams=11),
            Depot(id='east', name='EAST LOGISTICS CENTER', location_coords='22.60, 88.40', food=10200, water=21000, medical=1600, teams=12),
            Depot(id='north', name='NORTH STRATEGIC RESERVE', location_coords='28.60, 77.20', food=15000, water=30000, medical=2200, teams=18),
            Depot(id='central', name='CENTRAL MOBILIZATION UNIT', location_coords='17.40, 78.50', food=8800, water=17000, medical=1300, teams=10)
        ]
        db.session.bulk_save_objects(depots)
        db.session.commit()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    alerts = Alert.query.all()
    return jsonify([{'id': a.id, 'title': a.title, 'severity': a.severity, 'location': a.location, 'time': a.time, 'description': a.description} for a in alerts])

@app.route('/api/resources', methods=['GET'])
def get_resources():
    resources = Resource.query.all()
    return jsonify([{'id': r.id, 'name': r.name, 'type': r.type, 'status': r.status, 'location': r.location, 'quantity': r.quantity} for r in resources])

@app.route('/api/weather', methods=['GET'])
def get_weather():
    weather = Weather.query.all()
    return jsonify([{'id': w.id, 'region': w.region, 'condition': w.condition, 'temperature': w.temperature, 'wind_speed': w.wind_speed, 'precipitation': w.precipitation} for w in weather])

@app.route('/api/incidents', methods=['GET'])
def get_incidents():
    incidents = Incident.query.all()
    return jsonify([{'id': i.id, 'lat': i.lat, 'lng': i.lng, 'type': i.type, 'severity': i.severity, 'description': i.description} for i in incidents])

@app.route('/api/stats', methods=['GET'])
def get_stats():
    total_resources = Resource.query.count()
    active_alerts = Alert.query.filter_by(severity='high').count()
    deployed_teams = Resource.query.filter_by(status='deployed', type='rescue').count()
    return jsonify({
        'total_resources': total_resources,
        'active_alerts': active_alerts,
        'deployed_teams': deployed_teams,
        'safe_zones_active': 12
    })

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get('username'), password=data.get('password')).first()
    if user:
        return jsonify({'success': True, 'role': user.role, 'username': user.username, 'id': user.id})
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    role     = data.get('role', 'citizen')
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password are required'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'message': 'Username already exists'}), 409
    if role not in ('admin', 'rescue', 'citizen'):
        role = 'citizen'
    new_user = User(username=username, password=password, role=role)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True, 'role': new_user.role, 'username': new_user.username, 'id': new_user.id})

@app.route('/api/reports', methods=['GET', 'POST'])
def handle_reports():
    if request.method == 'POST':
        data = request.json
        
        # Simple AI risk simulation based on keywords
        desc = data.get('description', '').lower()
        risk = 30
        if 'flood' in desc or 'earthquake' in desc or 'cyclone' in desc:
            risk += 40
        if 'urgent' in desc or 'help' in desc or 'critical' in desc:
            risk += 20
        risk = min(risk, 100)
            
        report = FieldReport(
            author_id=data.get('author_id'),
            author_name=data.get('author_name'),
            author_role=data.get('author_role'),
            description=data.get('description'),
            location=data.get('location'),
            timestamp=datetime.now().strftime("%I:%M %p, %d %b %Y"),
            risk_percentage=risk
        )
        db.session.add(report)
        db.session.commit()
        return jsonify({'success': True, 'report_id': report.id, 'risk': risk})
    
    reports = FieldReport.query.order_by(FieldReport.id.desc()).all()
    return jsonify([{
        'id': r.id, 'author_name': r.author_name, 'author_role': r.author_role,
        'description': r.description, 'location': r.location, 
        'timestamp': r.timestamp, 'risk_percentage': r.risk_percentage
    } for r in reports])

@app.route('/api/trend-data', methods=['GET'])
def get_trend_data():
    # Mock data for National Risk Trend 2016-present
    return jsonify({
        'years': ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
        'risk_levels': [45, 52, 48, 60, 55, 70, 68, 75, 82, 78, 85]
    })

@app.route('/api/demand-supply', methods=['GET'])
def get_demand_supply():
    return jsonify({
        'categories': ['Food', 'Medical', 'Rescue Teams', 'Shelter', 'Transport'],
        'demand': [85, 90, 75, 60, 50],
        'supply': [70, 60, 80, 55, 65]
    })

@app.route('/api/depots', methods=['GET', 'POST'])
def get_depots():
    if request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip()
        lat  = data.get('lat')
        lng  = data.get('lng')
        if not name or lat is None or lng is None:
            return jsonify({'success': False, 'message': 'Name, lat, and lng are required'}), 400
        depot_id = name.lower().replace(' ', '_')[:20]
        # Ensure unique id
        base_id = depot_id
        counter = 1
        while Depot.query.get(depot_id):
            depot_id = f"{base_id}_{counter}"
            counter += 1
        new_depot = Depot(
            id=depot_id, name=name,
            location_coords=f"{lat}, {lng}",
            food=int(data.get('food', 0)),
            water=int(data.get('water', 0)),
            medical=int(data.get('medical', 0)),
            teams=int(data.get('teams', 0))
        )
        db.session.add(new_depot)
        db.session.commit()
        return jsonify({'success': True, 'id': new_depot.id, 'name': new_depot.name,
                        'location_coords': new_depot.location_coords,
                        'food': new_depot.food, 'water': new_depot.water,
                        'medical': new_depot.medical, 'teams': new_depot.teams})
    depots = Depot.query.all()
    return jsonify([{
        'id': d.id, 'name': d.name, 'location_coords': d.location_coords,
        'food': d.food, 'water': d.water, 'medical': d.medical, 'teams': d.teams
    } for d in depots])

@app.route('/api/depots/<depot_id>', methods=['PUT'])
def update_depot(depot_id):
    data = request.json
    depot = Depot.query.get(depot_id)
    if not depot:
        return jsonify({'success': False, 'message': 'Depot not found'}), 404
    
    depot.food = data.get('food', depot.food)
    depot.water = data.get('water', depot.water)
    depot.medical = data.get('medical', depot.medical)
    depot.teams = data.get('teams', depot.teams)
    
    db.session.commit()
    return jsonify({'success': True})


# Missing Persons API
@app.route('/api/missing-persons', methods=['GET', 'POST'])
def handle_missing_persons():
    if request.method == 'POST':
        # Support both JSON and multipart form data
        if request.content_type and 'multipart/form-data' in request.content_type:
            data = request.form
            photo_file = request.files.get('photo')
            photo_data = None
            if photo_file and photo_file.filename:
                file_bytes = photo_file.read()
                mime = photo_file.content_type or 'image/jpeg'
                photo_data = f"data:{mime};base64," + base64.b64encode(file_bytes).decode('utf-8')
        else:
            data = request.json or {}
            photo_data = data.get('photo_data')

        name = (data.get('name') or '').strip()
        age_raw = data.get('age', 0)
        last_seen_location = (data.get('last_seen_location') or '').strip()
        reporter_name = (data.get('reporter_name') or '').strip()

        if not name or not last_seen_location:
            return jsonify({'success': False, 'message': 'Name and last seen location are required'}), 400

        try:
            age = int(age_raw)
        except (ValueError, TypeError):
            age = 0

        mp = MissingPerson(
            name=name,
            age=age,
            gender=data.get('gender', ''),
            last_seen_location=last_seen_location,
            last_seen_time=data.get('last_seen_time', ''),
            description=data.get('description', ''),
            reporter_name=reporter_name,
            reporter_phone=data.get('reporter_phone', ''),
            photo_data=photo_data,
            status='missing',
            submitted_at=datetime.now().strftime("%I:%M %p, %d %b %Y")
        )
        db.session.add(mp)
        db.session.commit()
        return jsonify({'success': True, 'id': mp.id})

    # GET — return sorted by age ascending (youngest = highest priority)
    persons = MissingPerson.query.order_by(MissingPerson.age.asc()).all()
    return jsonify([{
        'id': p.id, 'name': p.name, 'age': p.age, 'gender': p.gender,
        'last_seen_location': p.last_seen_location, 'last_seen_time': p.last_seen_time,
        'description': p.description, 'reporter_name': p.reporter_name,
        'reporter_phone': p.reporter_phone, 'photo_data': p.photo_data,
        'status': p.status, 'submitted_at': p.submitted_at
    } for p in persons])

@app.route('/api/missing-persons/<int:person_id>/status', methods=['PUT'])
def update_missing_person_status(person_id):
    data = request.json or {}
    person = MissingPerson.query.get(person_id)
    if not person:
        return jsonify({'success': False, 'message': 'Person not found'}), 404
    new_status = data.get('status', 'missing')
    if new_status in ('missing', 'found'):
        person.status = new_status
        db.session.commit()
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
