import csv
import random

# Settings
N = 100_000

# accidents.csv
def generate_accidents(path, n):
    header = ['accident_id','latitude','longitude','lighting_level','traffic_density','area_type','time_hour','severity']
    area_types = ['urban', 'suburban', 'rural']
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for i in range(1, n+1):
            lat = round(random.uniform(18.9, 19.3), 4)
            lon = round(random.uniform(72.8, 73.0), 4)
            lighting = round(random.uniform(0, 1), 2)
            traffic = round(random.uniform(0, 1), 2)
            area = random.choice(area_types)
            hour = random.randint(0, 23)
            severity = random.randint(0, 2)
            writer.writerow([i, lat, lon, lighting, traffic, area, hour, severity])

def generate_lighting(path, n):
    header = ['zone_id','latitude','longitude','lighting_intensity','light_type','functional','area_type']
    area_types = ['urban', 'suburban', 'rural']
    light_types = ['LED', 'sodium', 'none']
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for i in range(1, n+1):
            lat = round(random.uniform(18.9, 19.3), 4)
            lon = round(random.uniform(72.8, 73.0), 4)
            intensity = round(random.uniform(0, 1), 2)
            light_type = random.choice(light_types)
            functional = random.randint(0, 1)
            area = random.choice(area_types)
            writer.writerow([i, lat, lon, intensity, light_type, functional, area])

def generate_traffic(path, n):
    header = ['zone_id','latitude','longitude','hour','traffic_density','avg_speed','vehicle_count','pedestrian_count','area_type']
    area_types = ['urban', 'suburban', 'rural']
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for i in range(1, n+1):
            lat = round(random.uniform(18.9, 19.3), 4)
            lon = round(random.uniform(72.8, 73.0), 4)
            hour = random.randint(0, 23)
            density = round(random.uniform(0, 1), 2)
            speed = random.randint(10, 80)
            vehicles = random.randint(0, 200)
            peds = random.randint(0, 100)
            area = random.choice(area_types)
            writer.writerow([i, lat, lon, hour, density, speed, vehicles, peds, area])

if __name__ == '__main__':
    generate_accidents('data/accidents.csv', N)
    generate_lighting('data/lighting.csv', N)
    generate_traffic('data/traffic.csv', N)
