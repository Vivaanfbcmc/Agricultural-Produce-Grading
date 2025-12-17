CREATE TABLE farmers (
                         farmer_id INT AUTO_INCREMENT PRIMARY KEY,

                         fname VARCHAR(50) NOT NULL,
                         lname VARCHAR(50) NOT NULL,

                         phone VARCHAR(15) NOT NULL UNIQUE,   -- used for login
                         email VARCHAR(100),                  -- optional

                         password VARCHAR(255) NOT NULL,      -- will store hashed password later

                         state VARCHAR(100) NOT NULL,
                         district VARCHAR(100) NOT NULL,

                         veg_type VARCHAR(255),               -- tomatoes, onions etc.

                         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
