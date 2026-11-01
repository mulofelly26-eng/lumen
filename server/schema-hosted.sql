-- =====================================================
-- Lumen: tables for a HOSTED database (Aiven and similar)
-- Differences from schema.sql:
--   * no CREATE DATABASE / USE (the provider gives you a database already, e.g. "defaultdb")
--   * includes the tmdb_id and duration_seconds columns
--   * no sample movies: fill it with  node server/import-tmdb.js
--   * never drops tables, so it is safe to run again
-- Before running: make your hosted database the default schema
-- (Workbench: right-click it in the Schemas list, "Set as Default Schema").
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS genres (
    id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(50)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_genres_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movies (
    id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    tmdb_id          INT UNSIGNED      NULL,
    title            VARCHAR(200)      NOT NULL,
    description      TEXT              NULL,
    release_year     SMALLINT UNSIGNED NULL,
    duration_minutes SMALLINT UNSIGNED NULL,
    poster_url       VARCHAR(500)      NULL,
    trailer_url      VARCHAR(500)      NULL,
    video_url        VARCHAR(500)      NULL,
    rating           DECIMAL(3,1)      NULL,
    created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_movies_tmdb_id (tmdb_id),
    KEY idx_movies_title (title),
    KEY idx_movies_year (release_year),
    CONSTRAINT chk_movies_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movie_genres (
    movie_id INT UNSIGNED NOT NULL,
    genre_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    CONSTRAINT fk_mg_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
    CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watchlist (
    user_id  INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    added_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, movie_id),
    CONSTRAINT fk_wl_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_wl_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watch_history (
    user_id          INT UNSIGNED NOT NULL,
    movie_id         INT UNSIGNED NOT NULL,
    progress_seconds INT UNSIGNED NOT NULL DEFAULT 0,
    duration_seconds INT UNSIGNED NULL,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, movie_id),
    CONSTRAINT fk_wh_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_wh_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB;
