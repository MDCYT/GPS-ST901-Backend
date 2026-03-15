CREATE TABLE devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tracker_id VARCHAR(30) UNIQUE NOT NULL,
  name TEXT,
  vehicle_name TEXT,
  device_password_hash VARCHAR(255),
  phone_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_device_access (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  role ENUM('owner', 'viewer') NOT NULL DEFAULT 'viewer',
  granted_by_user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY user_device_unique (user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE device_connections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  remote_ip VARCHAR(45),
  remote_port INT,
  connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TIMESTAMP NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE gps_positions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  packet_time TIMESTAMP NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid BOOLEAN NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  speed_kmh DOUBLE,
  course DOUBLE,
  raw_packet TEXT NOT NULL,
  status_flags VARCHAR(50),
  gsm_signal INT,
  battery_level INT,
  external_power_mv INT,
  voltage_mv INT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX gps_positions_device_time_idx
  ON gps_positions(device_id, packet_time);

CREATE TABLE device_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  payload JSON,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE trips (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NULL,
  start_latitude DOUBLE,
  start_longitude DOUBLE,
  end_latitude DOUBLE,
  end_longitude DOUBLE,
  distance_km DOUBLE DEFAULT 0,
  max_speed_kmh DOUBLE,
  avg_speed_kmh DOUBLE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE device_commands (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  command_type VARCHAR(50) NOT NULL,
  command_payload TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  queued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  response_payload TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);