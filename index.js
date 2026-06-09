require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const PORT = process.env.PORT || 3000; 

const app = express();


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

  const deleteCelebrity = "DELETE FROM tblcelebrity WHERE BitID = ?";
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

// Insert bit
app.post("/api/insert/bit/", (req, res) => {
  const { type, title, category, artist, date: airDate, autoNum, time, hyperlink1, hyperlink2, hyperlink3, hyperlink4, hyperlink5, hyperlink6 } = req.body;

  const sqlInsert = "INSERT INTO tblbits (AirDate, Title, ArtistID, ProphetNum, Time, Type) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(sqlInsert, [airDate, title, artist, autoNum, time, type], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to insert bit" });
    }

    const primaryKey = result.insertId;
    const sqlInsert2 = "INSERT INTO tblhyperlink (BitID, Hyperlink1, Hyperlink2, Hyperlink3, Hyperlink4, Hyperlink5, Hyperlink6) VALUES (?, ?, ?, ?, ?, ?, ?)";
    db.query(sqlInsert2, [primaryKey, hyperlink1, hyperlink2, hyperlink3, hyperlink4, hyperlink5, hyperlink6], (err) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Failed to insert hyperlinks" });
      }
      res.json({ message: "Bit inserted successfully", bitID: primaryKey });
    });
  });
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
  const sqlAlbum = "SELECT albumkey.Album_Name, album.Album_Track FROM tblalbumkey albumkey, tblalbum album WHERE album.AlbumID = albumkey.AlbumID AND album.BitID = ?";
  db.query(sqlAlbum, [id], (err, result) => {
    res.send(result);
  });
});

app.get("/api/get/hyperlink/info/:searchBitID", (req, res) => {
  const id = req.params.searchBitID;
  const sqlHyperlink = "SELECT * FROM tblhyperlink hyperlink WHERE hyperlink.BitID = ?";
  db.query(sqlHyperlink, [id], (err, result) => {
    res.send(result);
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

// Update bit
app.post("/api/update/bit/", (req, res) => {
  const { bitID, type, title, time, autoNum } = req.body;

  const sqlUpdate = "UPDATE tblbits SET Title = ?, ProphetNum = ?, Time = ?, Type = ? WHERE BitID = ?";
  db.query(sqlUpdate, [title, autoNum, time, type, bitID], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to update bit" });
    }
    res.json({ message: "Bit updated successfully" });
  });
});

// Artist routes
app.post("/api/insert/artist/", (req, res) => {
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


const ARTIST_ID = 1;
// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

  try {
    // Replace 'http://localhost' with your Railway URL if testing externally
    const response = axios.get(`https://bobandtom3-production.up.railway.app:${PORT}/api/artist/${ARTIST_ID}`);
    
    // Prints the 'Name' property from the returned row data
    console.log(`Artist Name: ${response.data.Name}`);
  } catch (error) {
    console.error("Error fetching artist data:", error.message);
  }
});
