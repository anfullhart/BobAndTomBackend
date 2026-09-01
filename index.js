require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const PORT = process.env.PORT || 3000; 

const app = express();
app.set("trust proxy", 1);

// Database connection
const dbPool = mysql.createPool({
  host: process.env.MYSQLHOST || "tramway.proxy.rlwy.net",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "RfGgOCaxAMOdgcuSEEDVgYTgnzRvzDDK",
  database: process.env.MYSQLDATABASE || "railway",
  port: process.env.MYSQLPORT || 52386,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = dbPool;
const sessionStore = new MySQLStore({}, dbPool);


// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "bits_fallback_secure_string_secret", // Fixed deprecation warning
    store: sessionStore, // Fixed production MemoryStore leak warning
    resave: false,
    saveUninitialized: false,
    key: "bits_session_id",
    cookie: {
      secure: process.env.NODE_ENV === "production", // Uses secure cookies automatically on Railway
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    },
  })
);

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Auth middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userRole = req.session.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden: Insufficient role" });
    }

    next();
  };
};

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.get("/api/admin/dashboard",
  isAuthenticated,
  requireRole("admin", "owner"),
  (req, res) => {
    res.json({
      message: "Welcome to the admin dashboard",
      user: req.session.user
    });
  }
);

// Delete bit
app.post("/api/delete/bit", (req, res) => {
  const bitID = req.body.bitID;

  const deleteBit = "DELETE FROM tblbits WHERE BitID = ?";
  db.query(deleteBit, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteAlbum = "DELETE FROM tblalbum WHERE BitID = ?";
  db.query(deleteAlbum, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteCategory = "DELETE FROM tblcategory WHERE BitID = ?";
  db.query(deleteCategory, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteCelebrity = "DELETE FROM tblceleb WHERE BitID = ?";
  db.query(deleteCelebrity, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteHyperlink = "DELETE FROM tblhyperlink WHERE BitID = ?";
  db.query(deleteHyperlink, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteKeywords = "DELETE FROM tblkeywords WHERE BitID = ?";
  db.query(deleteKeywords, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteSeason = "DELETE FROM tblseason WHERE BitID = ?";
  db.query(deleteSeason, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteSport = "DELETE FROM tblsports WHERE BitID = ?";
  db.query(deleteSport, [bitID], (err) => {
    if (err) console.log(err);
  });

  const deleteSubject = "DELETE FROM tblsubject WHERE BitID = ?";
  db.query(deleteSubject, [bitID], (err) => {
    if (err) console.log(err);
  });

  res.json({ message: "Bit deleted" });
});

// Delete log
app.post("/api/delete/log", (req, res) => {
  const RS_ID = req.body.RS_ID;

  const deleteLog = "DELETE e, k, d FROM tblrunentries e JOIN tblrunkey k ON e.L_ID = k.L_ID JOIN tblrunsheetdate d ON k.RS_ID = d.RS_ID WHERE k.RS_ID = ?";
  db.query(deleteLog, [RS_ID], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to delete log" });
    }
    res.json({ message: "Log deleted" });
  });
});

// Edit run sheet
app.post("/api/edit/runSheet", (req, res) => {
  const { RS_ID, logDate, data, deletedRows } = req.body;

  if (!RS_ID || !Array.isArray(data)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  if (Array.isArray(deletedRows) && deletedRows.length > 0) {
    const deleteSql = `DELETE FROM tblrunentries WHERE L_ID IN (?)`;
    db.query(deleteSql, [deletedRows], (err) => {
      if (err) console.error("Failed to delete rows:", err);
    });
  }

  const updateDateSql = `UPDATE tblrunsheetdate SET RSDate = ? WHERE RS_ID = ?`;

  db.query(updateDateSql, [logDate, RS_ID], (err) => {
    if (err) {
      console.error("Date update failed:", err);
      return res.status(500).json({ error: "Failed to update date" });
    }

    const rowsToUpdate = data.filter((row) => row.L_ID);
    const rowsToInsert = data.filter(
      (row) => !row.L_ID && (row.bTime || row.bitDesc || row.ArtistID)
    );

    const updatePromises = rowsToUpdate.map((row) => {
      return new Promise((resolve, reject) => {
        const updateSql = `UPDATE tblrunentries SET bTime = ?, bitDesc = ?, ArtistID = ? WHERE L_ID = ?`;
        db.query(updateSql, [row.bTime, row.bitDesc, row.ArtistID, row.L_ID], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    const insertPromises = rowsToInsert.map((row) => {
      return new Promise((resolve, reject) => {
        const insertKeySql = `INSERT INTO tblrunkey (RS_ID) VALUES (?)`;
        db.query(insertKeySql, [RS_ID], (err, keyResult) => {
          if (err) return reject(err);

          const newL_ID = keyResult.insertId;
          const insertEntrySql = `INSERT INTO tblrunentries (L_ID, bTime, bitDesc, ArtistID) VALUES (?, ?, ?, ?)`;
          db.query(insertEntrySql, [newL_ID, row.bTime, row.bitDesc, row.ArtistID], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });

    Promise.all([...updatePromises, ...insertPromises])
      .then(() => {
        res.json({ message: "Run sheet updated successfully" });
      })
      .catch((err) => {
        console.error("Update/Insert failed:", err);
        res.status(500).json({ error: "Failed to update run sheet" });
      });
  });
});

// Insert run sheet
app.post("/api/insert/runSheet", (req, res) => {
  const { logDate, rows } = req.body;

  if (!logDate) {
    return res.status(400).send("logDate is required");
  }

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).send("No rows provided");
  }

  const cleanedRows = rows
    .map(r => ({
      time: (r.time || "").trim(),
      desc: (r.desc || "").trim(),
      artist: r.artist || null,
    }))
    .filter(r => r.time || r.desc || r.artist);

  if (cleanedRows.length === 0) {
    return res.status(400).send("All rows are empty");
  }

  const values = cleanedRows.map(r => [r.time, r.desc, r.artist]);

  const insertEntriesSQL = "INSERT INTO tblrunentries (bTime, bitDesc, ArtistID) VALUES ?";
  db.query(insertEntriesSQL, [values], (err, result) => {
    if (err) {
      console.error("Error inserting into tblrunentries:", err);
      return res.status(500).send("Failed to insert run sheet entries");
    }

    const insertedIds = [];
    for (let i = 0; i < values.length; i++) {
      insertedIds.push(result.insertId + i);
    }

    const selectRS_SQL = "SELECT RS_ID FROM tblrunsheetdate WHERE RSDate = ? LIMIT 1";
    db.query(selectRS_SQL, [logDate], (err, rsResult) => {
      if (err) {
        console.error("Error selecting RS_ID:", err);
        return res.status(500).send("Failed to check run sheet date");
      }

      const attachRowsToSheet = (rs_id) => {
        const runKeyValues = insertedIds.map(id => [rs_id, id]);
        const insertRunKeySQL = "INSERT INTO tblrunkey (RS_ID, L_ID) VALUES ?";
        db.query(insertRunKeySQL, [runKeyValues], (err) => {
          if (err) {
            console.error("Error inserting into tblrunkey:", err);
            return res.status(500).send("Failed to attach entries to run sheet");
          }
          return res.send({ message: "Run sheet saved successfully", RS_ID: rs_id });
        });
      };

      if (rsResult.length > 0) {
        attachRowsToSheet(rsResult[0].RS_ID);
      } else {
        const insertDateSQL = "INSERT INTO tblrunsheetdate (RSDate) VALUES (?)";
        db.query(insertDateSQL, [logDate], (err, insertDateResult) => {
          if (err) {
            console.error("Error inserting new RSDate:", err);
            return res.status(500).send("Failed to create new run sheet date");
          }
          attachRowsToSheet(insertDateResult.insertId);
        });
      }
    });
  });
});

// ============================================================
// INSERT COMPLETE BIT
// ============================================================
app.post("/api/insert/bit", async (req, res) => {
  const {
    type,
    title,
    category,
    categories = [],
    artist,
    date: airDate,
    autoNum,
    time,

    subjects = [],
    celebrities = [],

    sport,
    sports = [],

    season,
    seasons = [],

    keywords,
    hyperlinks = [],
    albums = []
  } = req.body;

  const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };

  try {

    // ==========================================================
    // 1. INSERT MAIN BIT
    // ==========================================================

    const bitResult = await query(
      `
      INSERT INTO tblbits
      (
        AirDate,
        Title,
        ArtistID,
        ProphetNum,
        Time,
        Type
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        airDate || null,
        title || null,
        artist || null,
        autoNum || null,
        time || null,
        type || null
      ]
    );

    const bitID = bitResult.insertId;

    console.log("Created BitID:", bitID);


    // ==========================================================
    // 2. CATEGORIES
    // ==========================================================

    let cleanCategories = [];

    if (Array.isArray(categories)) {
      cleanCategories = categories.filter(Boolean);
    }

    // Backwards compatibility with current frontend
    if (cleanCategories.length === 0 && category) {
      cleanCategories.push(category);
    }

    if (cleanCategories.length > 0) {

      const values = cleanCategories.map(catID => [
        bitID,
        catID
      ]);

      await query(
        `
        INSERT INTO ttblcategory
        (BitID, CatID)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 3. SUBJECTS
    // ==========================================================

    const cleanSubjects = Array.isArray(subjects)
      ? [...new Set(subjects.filter(Boolean))]
      : [];

    if (cleanSubjects.length > 0) {

      const values = cleanSubjects.map(subID => [
        bitID,
        subID
      ]);

      await query(
        `
        INSERT INTO ttblsubject
        (BitID, SubID)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 4. CELEBRITIES
    // ==========================================================

    const cleanCelebrities = Array.isArray(celebrities)
      ? [...new Set(celebrities.filter(Boolean))]
      : [];

    if (cleanCelebrities.length > 0) {

      const values = cleanCelebrities.map(celebID => [
        bitID,
        celebID
      ]);

      await query(
        `
        INSERT INTO ttblceleb
        (BitID, CelebID)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 5. SPORTS
    // ==========================================================

    let cleanSports = Array.isArray(sports)
      ? [...new Set(sports.filter(Boolean))]
      : [];

    // Backwards compatibility
    if (cleanSports.length === 0 && sport) {
      cleanSports.push(sport);
    }

    if (cleanSports.length > 0) {

      const values = cleanSports.map(sportID => [
        bitID,
        sportID
      ]);

      await query(
        `
        INSERT INTO ttblsports
        (BitID, SportID)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 6. SEASONS
    // ==========================================================

    let cleanSeasons = Array.isArray(seasons)
      ? [...new Set(seasons.filter(Boolean))]
      : [];

    // Backwards compatibility
    if (cleanSeasons.length === 0 && season) {
      cleanSeasons.push(season);
    }

    if (cleanSeasons.length > 0) {

      const values = cleanSeasons.map(seasonID => [
        bitID,
        seasonID
      ]);

      await query(
        `
        INSERT INTO ttblseason
        (BitID, SeasonID)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 7. HYPERLINKS
    // ==========================================================

    const cleanHyperlinks = Array.isArray(hyperlinks)
      ? hyperlinks
          .filter(link => link && String(link).trim() !== "")
          .map(link => String(link).trim())
      : [];

    if (cleanHyperlinks.length > 0) {

      const values = cleanHyperlinks.map(link => [
        bitID,
        link
      ]);

      await query(
        `
        INSERT INTO ttblhyperlink
        (BitID, Hyperlink)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 8. ALBUMS
    // ==========================================================

    const cleanAlbums = Array.isArray(albums)
      ? albums.filter(album =>
          album &&
          album.album !== undefined &&
          album.album !== null &&
          album.album !== ""
        )
      : [];

    if (cleanAlbums.length > 0) {

      const values = cleanAlbums.map(album => [
        bitID,
        album.album,
        album.track || 0
      ]);

      await query(
        `
        INSERT INTO ttblalbum
        (BitID, AlbumID, Album_Track)
        VALUES ?
        `,
        [values]
      );
    }


    // ==========================================================
    // 9. KEYWORDS
    // ==========================================================

    if (keywords && String(keywords).trim() !== "") {

      await query(
        `
        INSERT INTO ttblkeywords
        (BitID, Keywords)
        VALUES (?, ?)
        `,
        [
          bitID,
          String(keywords).trim()
        ]
      );
    }


    // ==========================================================
    // SUCCESS
    // ==========================================================

    console.log(`BIT ${bitID} INSERTED SUCCESSFULLY`);

    res.status(200).json({
      message: "Bit inserted successfully",
      bitID
    });

  } catch (err) {

    console.error("BIT INSERT ERROR:", err);

    res.status(500).json({
      error: "Failed to insert bit",
      details: err.message,
      sqlMessage: err.sqlMessage || null,
      code: err.code || null
    });
  }
});

// Get run sheet
app.get("/api/get/runSheet/:RS_ID", (req, res) => {
  const RS_ID = req.params.RS_ID;

  const sql = `
    SELECT 
      rk.RS_ID,
      rsd.RSDate,
      e.L_ID,
      e.bTime,
      e.bitDesc,
      e.ArtistID
    FROM tblrunkey rk
    JOIN tblrunentries e ON rk.L_ID = e.L_ID
    JOIN tblrunsheetdate rsd ON rk.RS_ID = rsd.RS_ID
    WHERE rk.RS_ID = ?
    ORDER BY e.bTime ASC
  `;

  db.query(sql, [RS_ID], (err, result) => {
    if (err) {
      console.error("Error fetching run sheet:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

// Get lookups
app.get("/api/get/celebrity", (req, res) => {
  const sqlSelect = "SELECT * FROM tblcelebkey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/subject", (req, res) => {
  const sqlSelect = "SELECT * FROM tblsubjectkey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/artist", (req, res) => {
  const sqlSelect = "SELECT * FROM tblartist ORDER BY Name ASC;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/category", (req, res) => {
  const sqlSelect = "SELECT * FROM tblcatkey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/sport", (req, res) => {
  const sqlSelect = "SELECT * FROM tblsportskey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/season", (req, res) => {
  const sqlSelect = "SELECT * FROM tblseasonkey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/album", (req, res) => {
  const sqlSelect = "SELECT * FROM tblalbumkey;";
  db.query(sqlSelect, (err, result) => {
    res.send(result);
  });
});

// Auth routes
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT userid, role FROM tbllogin WHERE login = ? AND pass = ?";

  db.query(sql, [username, password], (err, result) => {
    if (err) return res.status(500).send({ error: err });

    if (result.length > 0) {
      req.session.user = {
        userid: result[0].userid,
        username,
        role: result[0].role,
      };

      res.send({
        authenticated: true,
        role: result[0].role,
      });
    } else {
      res.send({ authenticated: false });
    }
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.json({ loggedOut: true });
  });
});

app.get("/api/auth/check", (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Admin routes
app.get("/api/admin/users", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sql = "SELECT userid, login, role FROM tbllogin ORDER BY userid ASC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

app.post("/api/admin/users", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { username, password, role } = req.body;
  const sql = "INSERT INTO tbllogin (login, pass, role) VALUES (?, ?, ?)";
  db.query(sql, [username, password, role], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "User added", userid: result.insertId });
  });
});

app.put("/api/admin/users/:id", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { username, password, role } = req.body;
  const { id } = req.params;

  let sql;
  let params;

  if (password) {
    sql = `UPDATE tbllogin SET login = ?, pass = ?, role = ? WHERE userid = ?`;
    params = [username, password, role, id];
  } else {
    sql = `UPDATE tbllogin SET login = ?, role = ? WHERE userid = ?`;
    params = [username, role, id];
  }

  db.query(sql, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update user" });
    }
    res.json({ message: "User updated successfully" });
  });
});

app.delete("/api/admin/users/:userid", (req, res) => {
  if (!req.session.user || !["admin", "owner"].includes(req.session.user.role)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userid } = req.params;
  const sql = "DELETE FROM tbllogin WHERE userid = ?";
  db.query(sql, [userid], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "User deleted" });
  });
});

// Bit detail routes
app.get("/api/get/bit/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlBit = "SELECT bits.BitID, bits.Title, bits.ProphetNum, bits.AirDate, bits.Time, bits.Type FROM tblbits bits WHERE bits.bitID = ?";
  db.query(sqlBit, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/sport/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlSport = "SELECT sportskey.Sport FROM tblsportskey sportskey, tblsports sports WHERE sportskey.SportID = sports.SportID AND sports.bitID = ?";
  db.query(sqlSport, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/subject/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlSubject = "SELECT subjectkey.Subject FROM tblsubjectkey subjectkey, tblsubject subject WHERE subject.SubID = subjectkey.SubID AND subject.BitID = ?";
  db.query(sqlSubject, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/celeb1/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCeleb1 = "SELECT celebKey.Name FROM tblceleb celeb, tblcelebkey celebkey WHERE celeb.Celeb1_ID = celebkey.CelebID AND celeb.BitID = ?";
  db.query(sqlCeleb1, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/celeb2/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCeleb2 = "SELECT celebKey.Name FROM tblceleb celeb, tblcelebkey celebkey WHERE celeb.Celeb2_ID = celebkey.CelebID AND celeb.BitID = ?";
  db.query(sqlCeleb2, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/season/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlSeason = "SELECT seasonkey.Season FROM tblseason season, tblseasonkey seasonkey WHERE season.SeasonID = seasonkey.SeasonID AND season.BitID = ?";
  db.query(sqlSeason, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/category/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlCategory = "SELECT catkey.Category FROM tblcatkey catkey, tblcategory category WHERE category.CatID = catkey.CatID AND category.BitID = ?";
  db.query(sqlCategory, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/album/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;

  const sql = `
    SELECT
      ak.Album_Name,
      a.Album_Track
    FROM tblalbum a
    JOIN tblalbumkey ak
      ON a.AlbumID = ak.AlbumID
    WHERE a.BitID = ?
    ORDER BY ak.Album_Name
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Album query error:", err);
      return res.status(500).json(err);
    }

    console.log("Albums:", result);

    res.json(result);
  });
});

app.get("/api/get/hyperlink/info/:searchBitID", (req, res) => {
  const bitID = req.params.searchBitID;

  const sqlHyperlink =
    "SELECT Hyperlink FROM tblhyperlink WHERE BitID = ?";

  db.query(sqlHyperlink, [bitID], (err, result) => {
    if (err) {
      console.log("HYPERLINK GET ERROR:", err);
      return res.status(500).json(err);
    }

    // Return an array of hyperlink strings
    const hyperlinks = result.map(row => row.Hyperlink);

    res.json(hyperlinks);
  });
});
// Search routes
app.get("/api/get/log/:searchKeyword/:searchArtist/:searchDate/:searchType", (req, res) => {
  const { keyword, artist, date, type } = req.params;
  const { searchKeyword, searchArtist, searchDate, searchType } = req.params;

  if (searchType == "Artist") {
    const sql1 = "SELECT tblrunentries.bitDesc, tblrunentries.bTime, tblartist.Name, tblrunsheetdate.RSDate, tblrunsheetdate.RS_ID FROM tblrunentries INNER JOIN tblrunkey ON tblrunentries.L_ID = tblrunkey.L_ID INNER JOIN tblrunsheetdate ON tblrunkey.RS_ID = tblrunsheetdate.RS_ID INNER JOIN tblartist ON tblrunentries.ArtistID = tblartist.ArtistID WHERE tblrunentries.ArtistID = ?";
    db.query(sql1, [searchArtist], (err, result) => {
      if (err) console.log(err);
      res.send(result);
    });
  } else if (searchType == "Date") {
    const sql2 = "SELECT tblartist.Name, tblartist.ArtistID, tblrunentries.bTime, tblrunentries.L_ID, tblrunentries.bitDesc, tblrunsheetdate.RS_ID, tblrunsheetdate.RSDate FROM tblartist INNER JOIN tblrunentries ON tblrunentries.ArtistID = tblartist.ArtistID INNER JOIN tblrunkey ON tblrunkey.L_ID = tblrunentries.L_ID INNER JOIN tblrunsheetdate ON tblrunsheetdate.RS_ID = tblrunkey.RS_ID WHERE LOCATE(?, tblrunsheetdate.RSDate) > 0";
    db.query(sql2, [searchDate], (err, result) => {
      if (err) console.log(err);
      res.send(result);
    });
  } else if (searchType == "keyword") {
    const sql3 = "SELECT tblartist.Name, tblartist.ArtistID, tblrunentries.bTime, tblrunentries.L_ID, tblrunentries.bitDesc, tblrunsheetdate.RS_ID, tblrunsheetdate.RSDate FROM tblrunentries JOIN tblrunkey ON tblrunentries.L_ID = tblrunkey.L_ID JOIN tblrunsheetdate ON tblrunkey.RS_ID = tblrunsheetdate.RS_ID JOIN tblartist ON tblrunentries.ArtistID = tblartist.ArtistID WHERE LOCATE(?, tblrunentries.bitDesc) > 0";
    db.query(sql3, [searchKeyword], (err, result) => {
      if (err) console.log(err);
      res.send(result);
    });
  } else {
    res.status(400).json({ error: "Invalid search type" });
  }
});

app.get("/api/get/:searchBitID/:searchKeyword/:searchType", (req, res) => {
  const { searchKeyword, searchBitID, searchType } = req.params;

  if (searchType == "Keyword") {
    const sqlSelect = "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND LOCATE(?, bits.Title) > 0";
    db.query(sqlSelect, [searchKeyword], (err, result) => {
      res.send(result);
    });
  } else if (searchType == "Bit ID") {
    const sqlSelect = "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND bits.bitID = ?";
    db.query(sqlSelect, [searchBitID], (err, result) => {
      res.send(result);
    });
  } else if (searchType == "Artist") {
    const sqlSelect = "SELECT bits.BitID, bits.Title, artist.Name, bits.ProphetNum, bits.Time, bits.Type FROM tblbits bits, tblartist artist WHERE bits.artistID = artist.artistID AND LOCATE(?, artist.name) > 0";
    db.query(sqlSelect, [searchBitID], (err, result) => {
      res.send(result);
    });
  } else {
    res.status(400).json({ error: "Invalid search type" });
  }
});

app.get("/api/get/log/:logID", (req, res) => {
  const id = req.params.logID;
  const sqlSelect = "SELECT runkey.RS_ID FROM tblrunkey runkey WHERE L_ID = ?";
  db.query(sqlSelect, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/log/details/:RS_ID", (req, res) => {
  const RS_ID = req.params.RS_ID;

  if (!RS_ID) return res.status(400).json({ error: "RS_ID is required" });

  const sql = `
    SELECT 
      k.RS_ID,
      d.RSDate,
      e.bTime,
      e.bitDesc,
      a.Name AS ArtistName
    FROM tblrunkey k
    JOIN tblrunentries e ON k.L_ID = e.L_ID
    JOIN tblrunsheetdate d ON k.RS_ID = d.RS_ID
    LEFT JOIN tblartist a ON e.ArtistID = a.ArtistID
    WHERE k.RS_ID = ?
    ORDER BY e.bTime ASC
  `;

  db.query(sql, [RS_ID], (err, result) => {
    if (err) {
      console.error("Error fetching log details:", err);
      return res.status(500).json({ error: "Failed to fetch log details" });
    }
    res.json(result);
  });
});



app.get("/api/get/bit/edit/:bitID", async (req, res) => {
  const bitID = req.params.bitID;

  if (!bitID) {
    return res.status(400).json({
      error: "BitID is required"
    });
  }

  const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };

  try {

    // ==========================================================
    // MAIN BIT
    // ==========================================================

    const bitResult = await query(
      `
      SELECT
        BitID,
        Title,
        ProphetNum,
        AirDate,
        Time,
        Type,
        ArtistID
      FROM tblbits
      WHERE BitID = ?
      `,
      [bitID]
    );

    if (bitResult.length === 0) {
      return res.status(404).json({
        error: "Bit not found"
      });
    }

    const bit = bitResult[0];


    // ==========================================================
    // CATEGORIES
    // ==========================================================

    const categoryResult = await query(
      `
      SELECT CatID
      FROM ttblcategory
      WHERE BitID = ?
      ORDER BY CatID
      `,
      [bitID]
    );


    // ==========================================================
    // SUBJECTS
    // ==========================================================

    const subjectResult = await query(
      `
      SELECT SubID
      FROM ttblsubject
      WHERE BitID = ?
      ORDER BY SubID
      `,
      [bitID]
    );


    // ==========================================================
    // CELEBRITIES
    // ==========================================================

    const celebrityResult = await query(
      `
      SELECT CelebID
      FROM ttblceleb
      WHERE BitID = ?
      ORDER BY CelebID
      `,
      [bitID]
    );


    // ==========================================================
    // SPORTS
    // ==========================================================

    const sportResult = await query(
      `
      SELECT SportID
      FROM ttblsports
      WHERE BitID = ?
      ORDER BY SportID
      `,
      [bitID]
    );


    // ==========================================================
    // SEASONS
    // ==========================================================

    const seasonResult = await query(
      `
      SELECT SeasonID
      FROM ttblseason
      WHERE BitID = ?
      ORDER BY SeasonID
      `,
      [bitID]
    );


    // ==========================================================
    // KEYWORDS
    // ==========================================================

    const keywordResult = await query(
      `
      SELECT Keywords
      FROM ttblkeywords
      WHERE BitID = ?
      ORDER BY KeywordID
      `,
      [bitID]
    );


    // ==========================================================
    // HYPERLINKS
    // ==========================================================

    const hyperlinkResult = await query(
      `
      SELECT LinkID, Hyperlink
      FROM ttblhyperlink
      WHERE BitID = ?
      ORDER BY LinkID
      `,
      [bitID]
    );


    // ==========================================================
    // ALBUMS
    // ==========================================================

    const albumResult = await query(
      `
      SELECT
        AlbumID,
        Album_Track
      FROM ttblalbum
      WHERE BitID = ?
      ORDER BY AlbumID, Album_Track
      `,
      [bitID]
    );


    // ==========================================================
    // RETURN EVERYTHING
    // ==========================================================

    res.json({

      bitID: bit.BitID,

      type: bit.Type || "",

      title: bit.Title || "",

      category:
        categoryResult.length > 0
          ? categoryResult[0].CatID
          : "",

      categories:
        categoryResult.map(row => row.CatID),

      artist: bit.ArtistID || "",

      date: bit.AirDate
        ? new Date(bit.AirDate).toISOString().split("T")[0]
        : "",

      time: bit.Time || "",

      autoNum: bit.ProphetNum || "",

      subjects:
        subjectResult.map(row => row.SubID),

      celebrities:
        celebrityResult.map(row => row.CelebID),

      sports:
        sportResult.map(row => row.SportID),

      seasons:
        seasonResult.map(row => row.SeasonID),

      keywords:
        keywordResult.length > 0
          ? keywordResult[0].Keywords
          : "",

      hyperlinks:
        hyperlinkResult.map(row => row.Hyperlink),

      albums:
        albumResult.map(row => ({
          album: row.AlbumID,
          track: row.Album_Track || ""
        }))
    });

  } catch (err) {

    console.error("GET BIT EDIT ERROR:", err);

    res.status(500).json({
      error: "Failed to load bit",
      details: err.message
    });
  }
});


// ============================================================
// UPDATE COMPLETE BIT
// ============================================================

app.post("/api/update/bit/", (req, res) => {
  const {
    bitID,
    type,
    title,
    category,
    artist,
    date,
    time,
    autoNum,

    subjects = [],

    celebrity1,
    celebrity2,

    sport,
    season,

    keywords,

    hyperlinks = [],

    albums = []
  } = req.body;

  if (!bitID) {
    return res.status(400).json({
      error: "BitID is required"
    });
  }

  const connection = db;

  // ------------------------------------------------------------
  // Update main bit
  // ------------------------------------------------------------

  const updateBitSQL = `
    UPDATE tblbits
    SET
      AirDate = ?,
      Title = ?,
      ArtistID = ?,
      ProphetNum = ?,
      Time = ?,
      Type = ?
    WHERE BitID = ?
  `;

  connection.query(
    updateBitSQL,
    [
      date || null,
      title || null,
      artist || null,
      autoNum || null,
      time || null,
      type || null,
      bitID
    ],
    (err) => {
      if (err) {
        console.error("UPDATE BIT ERROR:", err);

        return res.status(500).json({
          error: "Failed to update bit",
          details: err.message
        });
      }

      // ----------------------------------------------------------
      // CATEGORY
      // ----------------------------------------------------------

      connection.query(
        "DELETE FROM tblcategory WHERE BitID = ?",
        [bitID],
        (err) => {
          if (err) {
            console.error("DELETE CATEGORY ERROR:", err);
            return res.status(500).json({
              error: "Failed to update category",
              details: err.message
            });
          }

          if (!category) {
            updateSubjects();
            return;
          }

          connection.query(
            "INSERT INTO tblcategory (BitID, CatID) VALUES (?, ?)",
            [bitID, category],
            (err) => {
              if (err) {
                console.error("INSERT CATEGORY ERROR:", err);
                return res.status(500).json({
                  error: "Failed to update category",
                  details: err.message
                });
              }

              updateSubjects();
            }
          );
        }
      );

      // ----------------------------------------------------------
      // SUBJECTS
      // ----------------------------------------------------------

      function updateSubjects() {
        connection.query(
          "DELETE FROM tblsubject WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE SUBJECT ERROR:", err);
              return res.status(500).json({
                error: "Failed to update subjects",
                details: err.message
              });
            }

            const cleanSubjects = Array.isArray(subjects)
              ? subjects.filter(Boolean)
              : [];

            if (cleanSubjects.length === 0) {
              updateCelebrities();
              return;
            }

            const subjectValues = cleanSubjects.map(subID => [
              bitID,
              subID
            ]);

            connection.query(
              "INSERT INTO tblsubject (BitID, SubID) VALUES ?",
              [subjectValues],
              (err) => {
                if (err) {
                  console.error("INSERT SUBJECT ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update subjects",
                    details: err.message
                  });
                }

                updateCelebrities();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // CELEBRITIES
      // ----------------------------------------------------------

      function updateCelebrities() {
        connection.query(
          "DELETE FROM tblceleb WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE CELEBRITY ERROR:", err);
              return res.status(500).json({
                error: "Failed to update celebrities",
                details: err.message
              });
            }

            if (!celebrity1 && !celebrity2) {
              updateSport();
              return;
            }

            connection.query(
              `
              INSERT INTO tblceleb
              (BitID, Celeb1_ID, Celeb2_ID)
              VALUES (?, ?, ?)
              `,
              [
                bitID,
                celebrity1 || null,
                celebrity2 || null
              ],
              (err) => {
                if (err) {
                  console.error("INSERT CELEBRITY ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update celebrities",
                    details: err.message
                  });
                }

                updateSport();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // SPORT
      // ----------------------------------------------------------

      function updateSport() {
        connection.query(
          "DELETE FROM tblsports WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE SPORT ERROR:", err);
              return res.status(500).json({
                error: "Failed to update sport",
                details: err.message
              });
            }

            if (!sport) {
              updateSeason();
              return;
            }

            connection.query(
              `
              INSERT INTO tblsports
              (BitID, SportID)
              VALUES (?, ?)
              `,
              [bitID, sport],
              (err) => {
                if (err) {
                  console.error("INSERT SPORT ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update sport",
                    details: err.message
                  });
                }

                updateSeason();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // SEASON
      // ----------------------------------------------------------

      function updateSeason() {
        connection.query(
          "DELETE FROM tblseason WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE SEASON ERROR:", err);
              return res.status(500).json({
                error: "Failed to update season",
                details: err.message
              });
            }

            if (!season) {
              updateKeywords();
              return;
            }

            connection.query(
              `
              INSERT INTO tblseason
              (BitID, SeasonID)
              VALUES (?, ?)
              `,
              [bitID, season],
              (err) => {
                if (err) {
                  console.error("INSERT SEASON ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update season",
                    details: err.message
                  });
                }

                updateKeywords();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // KEYWORDS
      // ----------------------------------------------------------

      function updateKeywords() {
        connection.query(
          "DELETE FROM tblkeywords WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE KEYWORDS ERROR:", err);
              return res.status(500).json({
                error: "Failed to update keywords",
                details: err.message
              });
            }

            if (!keywords || !keywords.trim()) {
              updateHyperlinks();
              return;
            }

            connection.query(
              `
              INSERT INTO tblkeywords
              (BitID, Keywords)
              VALUES (?, ?)
              `,
              [bitID, keywords],
              (err) => {
                if (err) {
                  console.error("INSERT KEYWORDS ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update keywords",
                    details: err.message
                  });
                }

                updateHyperlinks();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // HYPERLINKS
      // ----------------------------------------------------------

      function updateHyperlinks() {
        connection.query(
          "DELETE FROM tblhyperlink WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE HYPERLINK ERROR:", err);
              return res.status(500).json({
                error: "Failed to update hyperlinks",
                details: err.message
              });
            }

            const cleanLinks = Array.isArray(hyperlinks)
              ? hyperlinks
                  .filter(link => link && link.trim() !== "")
                  .map(link => link.trim())
              : [];

            if (cleanLinks.length === 0) {
              updateAlbums();
              return;
            }

            const hyperlinkValues = cleanLinks.map(link => [
              bitID,
              link
            ]);

            connection.query(
              `
              INSERT INTO tblhyperlink
              (BitID, Hyperlink)
              VALUES ?
              `,
              [hyperlinkValues],
              (err) => {
                if (err) {
                  console.error("INSERT HYPERLINK ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update hyperlinks",
                    details: err.message
                  });
                }

                updateAlbums();
              }
            );
          }
        );
      }

      // ----------------------------------------------------------
      // ALBUMS
      // ----------------------------------------------------------

      function updateAlbums() {
        connection.query(
          "DELETE FROM tblalbum WHERE BitID = ?",
          [bitID],
          (err) => {
            if (err) {
              console.error("DELETE ALBUM ERROR:", err);
              return res.status(500).json({
                error: "Failed to update albums",
                details: err.message
              });
            }

            const cleanAlbums = Array.isArray(albums)
              ? albums.filter(
                  album => album && album.album
                )
              : [];

            if (cleanAlbums.length === 0) {
              return res.json({
                message: "Bit updated successfully",
                bitID
              });
            }

            const albumValues = cleanAlbums.map(album => [
              bitID,
              album.album,
              album.track || null
            ]);

            connection.query(
              `
              INSERT INTO tblalbum
              (BitID, AlbumID, Album_Track)
              VALUES ?
              `,
              [albumValues],
              (err) => {
                if (err) {
                  console.error("INSERT ALBUM ERROR:", err);
                  return res.status(500).json({
                    error: "Failed to update albums",
                    details: err.message
                  });
                }

                return res.json({
                  message: "Bit updated successfully",
                  bitID
                });
              }
            );
          }
        );
      }
    }
  );
});

// Artist routes
app.post("/artist/", (req, res) => {
  const name = req.body.name;

  const sqlInsert = "INSERT INTO tblartist (Name) VALUES (?)";
  db.query(sqlInsert, [name], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to insert artist" });
    }
    res.json({ message: "Artist added" });
  });
});

app.post("/api/delete/artist", (req, res) => {
  const id = req.body.deleteArtist;

  const sql1 = 'DELETE FROM tblartist WHERE ArtistID = ?';
  db.query(sql1, [id], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to delete artist" });
    }
    res.json({ message: "Artist deleted" });
  });
});


// ==========================================
// GET COMPLETE BIT INFORMATION
// ==========================================
app.get("/api/get/bit/full/:bitID", async (req, res) => {
  const bitID = req.params.bitID;

  if (!bitID) {
    return res.status(400).json({
      error: "bitID is required"
    });
  }

  try {
    // ------------------------------------------
    // Main bit
    // ------------------------------------------

    const bit = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT
          b.BitID,
          b.Title,
          b.ProphetNum,
          b.AirDate,
          b.Time,
          b.Type,
          b.ArtistID
        FROM tblbits b
        WHERE b.BitID = ?
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result[0]);
        }
      );
    });

    if (!bit) {
      return res.status(404).json({
        error: "Bit not found"
      });
    }

    // ------------------------------------------
    // Category
    // ------------------------------------------

    const category = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT CatID
        FROM tblcategory
        WHERE BitID = ?
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result[0]?.CatID || "");
        }
      );
    });

    // ------------------------------------------
    // Subjects
    // ------------------------------------------

    const subjects = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT SubID
        FROM tblsubject
        WHERE BitID = ?
        ORDER BY SubID
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result.map(row => row.SubID));
        }
      );
    });

    // ------------------------------------------
    // Celebrities
    // ------------------------------------------

    const celebrities = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT Celeb1_ID, Celeb2_ID
        FROM tblceleb
        WHERE BitID = ?
        LIMIT 1
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else {
            resolve({
              celebrity1: result[0]?.Celeb1_ID || "",
              celebrity2: result[0]?.Celeb2_ID || ""
            });
          }
        }
      );
    });

    // ------------------------------------------
    // Sport
    // ------------------------------------------

    const sport = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT SportID
        FROM tblsports
        WHERE BitID = ?
        LIMIT 1
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result[0]?.SportID || "");
        }
      );
    });

    // ------------------------------------------
    // Season
    // ------------------------------------------

    const season = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT SeasonID
        FROM tblseason
        WHERE BitID = ?
        LIMIT 1
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result[0]?.SeasonID || "");
        }
      );
    });

    // ------------------------------------------
    // Keywords
    // ------------------------------------------

    const keywords = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT Keywords
        FROM tblkeywords
        WHERE BitID = ?
        LIMIT 1
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result[0]?.Keywords || "");
        }
      );
    });

    // ------------------------------------------
    // Hyperlinks
    // ------------------------------------------

    const hyperlinks = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT Hyperlink
        FROM tblhyperlink
        WHERE BitID = ?
        ORDER BY Hyperlink
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else resolve(result.map(row => row.Hyperlink));
        }
      );
    });

    // ------------------------------------------
    // Albums
    // ------------------------------------------

    const albums = await new Promise((resolve, reject) => {
      db.query(
        `
        SELECT
          AlbumID,
          Album_Track
        FROM tblalbum
        WHERE BitID = ?
        ORDER BY AlbumID
        `,
        [bitID],
        (err, result) => {
          if (err) reject(err);
          else {
            resolve(
              result.map(row => ({
                albumID: row.AlbumID,
                track: row.Album_Track || ""
              }))
            );
          }
        }
      );
    });

    // ------------------------------------------
    // Return everything
    // ------------------------------------------

    res.json({
      bitID: bit.BitID,
      type: bit.Type || "",
      title: bit.Title || "",
      date: bit.AirDate || "",
      time: bit.Time || "",
      autoNum: bit.ProphetNum || "",

      category: category,
      artist: bit.ArtistID || "",

      sub1: subjects[0] || "",
      sub2: subjects[1] || "",
      sub3: subjects[2] || "",
      sub4: subjects[3] || "",

      celebrity1: celebrities.celebrity1,
      celebrity2: celebrities.celebrity2,

      sport: sport,
      season: season,

      keywords: keywords,

      hyperlinks: hyperlinks,

      albums: albums
    });

  } catch (err) {
    console.error("FULL BIT GET ERROR:", err);

    res.status(500).json({
      error: "Failed to retrieve complete bit information",
      details: err.message
    });
  }
});



// Get celebrity list
app.get("/api/get/celebrities", (req, res) => {
    const sql = "SELECT * FROM tblcelebkey ORDER BY Name";

    db.query(sql, (err, result) => {
        if (err) {
            console.log(err);
            return;
        }
        res.send(result);
    });
});

// Add celebrity
app.post("/celebrity", (req, res) => {
    const name = req.body.name;

    const sql = "INSERT INTO tblcelebkey (Name) VALUES (?)";

    db.query(sql, [name], (err, result) => {
        if (err) {
            console.log(err);
            return;
        }
        res.send(result);
    });
});

// Delete celebrity
app.post("/api/delete/celebrity", (req, res) => {
    const celebID = req.body.deleteCelebrity;

    const sql = "DELETE FROM tblcelebkey WHERE CelebID = ?";

    db.query(sql, [celebID], (err, result) => {
        if (err) {
            console.log(err);
            return;
        }
        res.send(result);
    });
});


// Get Seasons
app.get("/api/get/seasons", (req, res) => {
    const sql = "SELECT * FROM tblseasonkey ORDER BY sorder, Season";

    db.query(sql, (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

// Insert Season
app.post("/api/insert/season", (req, res) => {
    const season = req.body.season;

    const sql = "INSERT INTO tblseasonkey (Season) VALUES (?)";

    db.query(sql, [season], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

// Delete Season
app.post("/api/delete/season", (req, res) => {
    const id = req.body.deleteSeason;

    const sql = "DELETE FROM tblseasonkey WHERE SeasonID = ?";

    db.query(sql, [id], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

app.get("/api/get/sports", (req, res) => {
    const sql = "SELECT * FROM tblsportskey ORDER BY Sport";

    db.query(sql, (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

app.post("/api/insert/sport", (req, res) => {
    const sport = req.body.sport;

    const sql = "INSERT INTO tblsportskey (Sport) VALUES (?)";

    db.query(sql, [sport], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

app.post("/api/delete/sport", (req, res) => {
    const id = req.body.deleteSport;

    const sql = "DELETE FROM tblsportskey WHERE SportID = ?";

    db.query(sql, [id], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

app.get("/api/get/subjects", (req, res) => {
    const sql = "SELECT * FROM tblsubjectkey ORDER BY Subject";

    db.query(sql, (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});
app.post("/api/insert/subject", (req, res) => {
    const subject = req.body.subject;

    const sql = "INSERT INTO tblsubjectkey (Subject) VALUES (?)";

    db.query(sql, [subject], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});
app.post("/api/delete/subject", (req, res) => {
    const id = req.body.deleteSubject;

    const sql = "DELETE FROM tblsubjectkey WHERE SubID = ?";

    db.query(sql, [id], (err, result) => {
        if (err) console.log(err);
        else res.send(result);
    });
});

// Get Albums
app.get("/api/get/albums", (req, res) => {
    const sql = "SELECT * FROM tblalbumkey ORDER BY Album_Name";

    db.query(sql, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Failed to get albums" });
        }

        res.send(result);
    });
});


// Insert Album
app.post("/api/insert/album", (req, res) => {
    const album = req.body.album;

    const sql = "INSERT INTO tblalbumkey (Album_Name) VALUES (?)";

    db.query(sql, [album], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Failed to insert album" });
        }

        res.send(result);
    });
});


// Delete Album
app.post("/api/delete/album", (req, res) => {
    const id = req.body.deleteAlbum;

    const sql = "DELETE FROM tblalbumkey WHERE AlbumID = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Failed to delete album" });
        }

        res.send(result);
    });
});
const testArtistId = 1;
// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  const sqlStartup = "SELECT Name FROM tblartist WHERE ArtistID = 2;";

  // Executes right when the server starts listening
  db.query(sqlStartup, (err, result) => {
    if (err) {
      console.log("Database error on startup:", err.message);
      return;
    }
    
})});
