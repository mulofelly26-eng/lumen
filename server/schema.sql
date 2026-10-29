-- =====================================================
-- Lumen movie site: database script
-- Run the whole file once. It is safe to run again:
-- it drops and recreates the tables (all data is lost).
-- =====================================================

CREATE DATABASE IF NOT EXISTS lumen
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE lumen;

-- Drop in reverse order of dependency
DROP TABLE IF EXISTS watch_history;
DROP TABLE IF EXISTS watchlist;
DROP TABLE IF EXISTS movie_genres;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS genres;
DROP TABLE IF EXISTS users;

-- -----------------------------------------------------
-- users
-- -----------------------------------------------------
CREATE TABLE users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- store a bcrypt hash, never the password
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- genres
-- -----------------------------------------------------
CREATE TABLE genres (
    id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_genres_name (name)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- movies
-- -----------------------------------------------------
CREATE TABLE movies (
    id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    title            VARCHAR(200)      NOT NULL,
    description      TEXT              NULL,
    release_year     SMALLINT UNSIGNED NULL,
    duration_minutes SMALLINT UNSIGNED NULL,
    poster_url       VARCHAR(500)      NULL,
    trailer_url      VARCHAR(500)      NULL,
    video_url        VARCHAR(500)      NULL,
    rating           DECIMAL(3,1)      NULL,       -- 0.0 to 10.0
    created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_movies_title (title),
    KEY idx_movies_year (release_year),
    CONSTRAINT chk_movies_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10))
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- movie_genres  (many-to-many between movies and genres)
-- -----------------------------------------------------
CREATE TABLE movie_genres (
    movie_id INT UNSIGNED NOT NULL,
    genre_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    CONSTRAINT fk_mg_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
    CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- watchlist  ("My List")
-- -----------------------------------------------------
CREATE TABLE watchlist (
    user_id  INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    added_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, movie_id),
    CONSTRAINT fk_wl_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_wl_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- watch_history  ("Continue watching")
-- -----------------------------------------------------
CREATE TABLE watch_history (
    user_id          INT UNSIGNED NOT NULL,
    movie_id         INT UNSIGNED NOT NULL,
    progress_seconds INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, movie_id),
    CONSTRAINT fk_wh_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_wh_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Sample data
-- =====================================================

INSERT INTO genres (id, name) VALUES
    (1, 'Thriller'),
    (2, 'Drama'),
    (3, 'Sci-Fi'),
    (4, 'Adventure'),
    (5, 'Mystery'),
    (6, 'Romance'),
    (7, 'Fantasy'),
    (8, 'Crime');

-- The titles are invented. poster_url, trailer_url and video_url are left empty
-- so the page shows its coloured placeholders. Fill them in when you have real files.
INSERT INTO movies (id, title, description, release_year, duration_minutes, rating) VALUES
    (1,  'The Last Signal',
         'A radio operator at a remote station picks up a message that was sent twenty years before it was written.',
         2026, 124, 8.1),
    (2,  'Salt Road',
         'Two strangers share a truck across a desert, each carrying a secret the other needs.',
         2025, 112, 7.6),
    (3,  'Paper Kingdoms',
         'A young cartographer discovers that the maps she draws begin to reshape the world.',
         2024, 118, 7.9),
    (4,  'Nine Floors Down',
         'A night-shift guard realises the building has more levels below ground than on the plans.',
         2026, 101, 6.8),
    (5,  'Harmattan',
         'During one dusty season, a family in Kinshasa must decide whether to stay or leave everything behind.',
         2023, 129, 8.4),
    (6,  'Fuck nigga',
         'Two musicians meet every evening at dusk on a bridge and never exchange names.',
         2025, 96, 7.2),
    (7,  'Copper Hill',
         'A retired detective is pulled back into the case that ended his career.',
         2022, 108, 7.5),
    (8,  'Long Tide',
         'A fishing village faces a tide that stays out for three days and reveals what the sea was hiding.',
         2024, 115, 7.0),
    (9,  'Quiet Orchard',
         'Three generations of one family gather for a harvest that will decide who inherits the land.',
         2021, 104, 7.8),
    (10, 'Glass Meridian',
         'A navigator on a drifting research ship finds that the clocks aboard no longer agree.',
         2026, 133, 7.4);

INSERT INTO movie_genres (movie_id, genre_id) VALUES
    (1, 1), (1, 3), (1, 5),
    (2, 4), (2, 2),
    (3, 7), (3, 4),
    (4, 1), (4, 5),
    (5, 2),
    (6, 6), (6, 2),
    (7, 8), (7, 1),
    (8, 5), (8, 7),
    (9, 2),
    (10, 3), (10, 1);

-- Quick check: shows each movie with its genres
SELECT m.id, m.title, m.release_year, m.rating,
       GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') AS genres
FROM movies m
LEFT JOIN movie_genres mg ON mg.movie_id = m.id
LEFT JOIN genres g        ON g.id = mg.genre_id
GROUP BY m.id
ORDER BY m.id;

DELETE FROM lumen.movies WHERE id <= 10;
