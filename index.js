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

// ============================================================
// DATABASE CONNECTION
// ============================================================

const dbPool = mysql.createPool({
  host: process.env.MYSQLHOST || "tramway.proxy.rlwy.net",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE || "railway",
  port: process.env.MYSQLPORT || 52386,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = dbPool;

const sessionStore = new MySQLStore({}, dbPool);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true
  })
);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "bits_fallback_secure_string_secret",

    store: sessionStore,

    resave: false,

    saveUninitialized: false,

    key: "bits_session_id",

    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,

      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax"
    }
  })
);

app.use(express.json());

app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

// ============================================================
// DATABASE PROMISE HELPER
// ============================================================

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({
      error: "Unauthorized"
    });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {

    if (!req.session.user) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const userRole = req.session.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Forbidden: Insufficient role"
      });
    }

    next();
  };
};

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message: "Server is running"
  });
});

// ============================================================
// ADMIN DASHBOARD
// ============================================================

app.get(
  "/api/admin/dashboard",

  isAuthenticated,

  requireRole("admin", "owner"),

  (req, res) => {

    res.json({
      message: "Welcome to the admin dashboard",
      user: req.session.user
    });

  }
);

// ============================================================
// DELETE BIT
// ============================================================

app.post(
  "/api/delete/bit",

  async (req, res) => {

    const bitID = req.body.bitID;

    if (!bitID) {
      return res.status(400).json({
        error: "BitID is required"
      });
    }

    try {

      // Delete relationship records first

      await query(
        "DELETE FROM ttblalbum WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblcategory WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblceleb WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblhyperlink WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblkeywords WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblseason WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblsports WHERE BitID = ?",
        [bitID]
      );

      await query(
        "DELETE FROM ttblsubject WHERE BitID = ?",
        [bitID]
      );

      // Delete main bit

      await query(
        "DELETE FROM tblbits WHERE BitID = ?",
        [bitID]
      );

      res.json({
        message: "Bit deleted successfully"
      });

    } catch (err) {

      console.error(
        "DELETE BIT ERROR:",
        err
      );

      res.status(500).json({
        error: "Failed to delete bit",
        details: err.message
      });

    }

  }
);

// ============================================================
// DELETE LOG
// ============================================================

app.post(
  "/api/delete/log",

  (req, res) => {

    const RS_ID = req.body.RS_ID;

    const deleteLog = `
      DELETE e, k, d
      FROM tblrunentries e
      JOIN tblrunkey k
        ON e.L_ID = k.L_ID
      JOIN tblrunsheetdate d
        ON k.RS_ID = d.RS_ID
      WHERE k.RS_ID = ?
    `;

    db.query(
      deleteLog,
      [RS_ID],

      (err) => {

        if (err) {

          console.error(err);

          return res.status(500).json({
            error: "Failed to delete log"
          });

        }

        res.json({
          message: "Log deleted"
        });

      }
    );

  }
);

// ============================================================
// EDIT RUN SHEET
// ============================================================

app.post(
  "/api/edit/runSheet",

  async (req, res) => {

    const {
      RS_ID,
      logDate,
      data,
      deletedRows
    } = req.body;

    if (!RS_ID || !Array.isArray(data)) {

      return res.status(400).json({
        error: "Invalid payload"
      });

    }

    try {

      // Delete removed rows

      if (
        Array.isArray(deletedRows) &&
        deletedRows.length > 0
      ) {

        await query(
          `
          DELETE FROM tblrunentries
          WHERE L_ID IN (?)
          `,
          [deletedRows]
        );

      }

      // Update date

      await query(
        `
        UPDATE tblrunsheetdate
        SET RSDate = ?
        WHERE RS_ID = ?
        `,
        [logDate, RS_ID]
      );

      const rowsToUpdate =
        data.filter(row => row.L_ID);

      const rowsToInsert =
        data.filter(
          row =>
            !row.L_ID &&
            (
              row.bTime ||
              row.bitDesc ||
              row.ArtistID
            )
        );

      // Update existing rows

      for (const row of rowsToUpdate) {

        await query(
          `
          UPDATE tblrunentries
          SET
            bTime = ?,
            bitDesc = ?,
            ArtistID = ?
          WHERE L_ID = ?
          `,
          [
            row.bTime,
            row.bitDesc,
            row.ArtistID,
            row.L_ID
          ]
        );

      }

      // Insert new rows

      for (const row of rowsToInsert) {

        const keyResult =
          await query(
            `
            INSERT INTO tblrunkey (RS_ID)
            VALUES (?)
            `,
            [RS_ID]
          );

        const newL_ID =
          keyResult.insertId;

        await query(
          `
          INSERT INTO tblrunentries
          (
            L_ID,
            bTime,
            bitDesc,
            ArtistID
          )
          VALUES (?, ?, ?, ?)
          `,
          [
            newL_ID,
            row.bTime,
            row.bitDesc,
            row.ArtistID
          ]
        );

      }

      res.json({
        message:
          "Run sheet updated successfully"
      });

    } catch (err) {

      console.error(
        "RUN SHEET UPDATE ERROR:",
        err
      );

      res.status(500).json({
        error:
          "Failed to update run sheet"
      });

    }

  }
);

// ============================================================
// INSERT RUN SHEET
// ============================================================

app.post(
  "/api/insert/runSheet",

  async (req, res) => {

    const {
      logDate,
      rows
    } = req.body;

    if (!logDate) {

      return res.status(400).send(
        "logDate is required"
      );

    }

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return res.status(400).send(
        "No rows provided"
      );

    }

    try {

      const cleanedRows =
        rows
          .map(row => ({

            time:
              (row.time || "").trim(),

            desc:
              (row.desc || "").trim(),

            artist:
              row.artist || null

          }))

          .filter(
            row =>
              row.time ||
              row.desc ||
              row.artist
          );

      if (cleanedRows.length === 0) {

        return res.status(400).send(
          "All rows are empty"
        );

      }

      // Find or create date

      let rsResult =
        await query(
          `
          SELECT RS_ID
          FROM tblrunsheetdate
          WHERE RSDate = ?
          LIMIT 1
          `,
          [logDate]
        );

      let RS_ID;

      if (rsResult.length > 0) {

        RS_ID =
          rsResult[0].RS_ID;

      } else {

        const insertDate =
          await query(
            `
            INSERT INTO tblrunsheetdate
            (RSDate)
            VALUES (?)
            `,
            [logDate]
          );

        RS_ID =
          insertDate.insertId;

      }

      // Insert entries

      for (const row of cleanedRows) {

        const entryResult =
          await query(
            `
            INSERT INTO tblrunentries
            (
              bTime,
              bitDesc,
              ArtistID
            )
            VALUES (?, ?, ?)
            `,
            [
              row.time,
              row.desc,
              row.artist
            ]
          );

        await query(
          `
          INSERT INTO tblrunkey
          (
            RS_ID,
            L_ID
          )
          VALUES (?, ?)
          `,
          [
            RS_ID,
            entryResult.insertId
          ]
        );

      }

      res.json({
        message:
          "Run sheet saved successfully",

        RS_ID
      });

    } catch (err) {

      console.error(
        "RUN SHEET INSERT ERROR:",
        err
      );

      res.status(500).json({
        error:
          "Failed to insert run sheet"
      });

    }

  }
);

// ============================================================
// INSERT COMPLETE BIT
// ============================================================

app.post(
  "/api/insert/bit",

  async (req, res) => {

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

    try {

      // ======================================================
      // MAIN BIT
      // ======================================================

      const bitResult =
        await query(

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

      const bitID =
        bitResult.insertId;

      // ======================================================
      // CATEGORIES
      // ======================================================

      let cleanCategories =
        Array.isArray(categories)
          ? [...new Set(categories.filter(Boolean))]
          : [];

      if (
        cleanCategories.length === 0 &&
        category
      ) {

        cleanCategories.push(category);

      }

      if (cleanCategories.length > 0) {

        const values =
          cleanCategories.map(
            catID => [
              bitID,
              catID
            ]
          );

        await query(

          `
          INSERT INTO ttblcategory
          (
            BitID,
            CatID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SUBJECTS
      // ======================================================

      const cleanSubjects =
        Array.isArray(subjects)

          ? [...new Set(
              subjects.filter(Boolean)
            )]

          : [];

      if (cleanSubjects.length > 0) {

        const values =
          cleanSubjects.map(
            subID => [
              bitID,
              subID
            ]
          );

        await query(

          `
          INSERT INTO ttblsubject
          (
            BitID,
            SubID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // CELEBRITIES
      // ======================================================

      const cleanCelebrities =
        Array.isArray(celebrities)

          ? [...new Set(
              celebrities.filter(Boolean)
            )]

          : [];

      if (cleanCelebrities.length > 0) {

        const values =
          cleanCelebrities.map(
            celebID => [
              bitID,
              celebID
            ]
          );

        await query(

          `
          INSERT INTO ttblceleb
          (
            BitID,
            CelebID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SPORTS
      // ======================================================

      let cleanSports =
        Array.isArray(sports)

          ? [...new Set(
              sports.filter(Boolean)
            )]

          : [];

      if (
        cleanSports.length === 0 &&
        sport
      ) {

        cleanSports.push(sport);

      }

      if (cleanSports.length > 0) {

        const values =
          cleanSports.map(
            sportID => [
              bitID,
              sportID
            ]
          );

        await query(

          `
          INSERT INTO ttblsports
          (
            BitID,
            SportID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SEASONS
      // ======================================================

      let cleanSeasons =
        Array.isArray(seasons)

          ? [...new Set(
              seasons.filter(Boolean)
            )]

          : [];

      if (
        cleanSeasons.length === 0 &&
        season
      ) {

        cleanSeasons.push(season);

      }

      if (cleanSeasons.length > 0) {

        const values =
          cleanSeasons.map(
            seasonID => [
              bitID,
              seasonID
            ]
          );

        await query(

          `
          INSERT INTO ttblseason
          (
            BitID,
            SeasonID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // KEYWORDS
      // ======================================================

      if (
        keywords &&
        String(keywords).trim() !== ""
      ) {

        await query(

          `
          INSERT INTO ttblkeywords
          (
            BitID,
            Keywords
          )
          VALUES (?, ?)
          `,

          [
            bitID,
            String(keywords).trim()
          ]

        );

      }

      // ======================================================
      // HYPERLINKS
      // ======================================================

      const cleanHyperlinks =
        Array.isArray(hyperlinks)

          ? hyperlinks
              .filter(
                link =>
                  link &&
                  String(link).trim() !== ""
              )
              .map(
                link =>
                  String(link).trim()
              )

          : [];

      if (cleanHyperlinks.length > 0) {

        const values =
          cleanHyperlinks.map(
            link => [
              bitID,
              link
            ]
          );

        await query(

          `
          INSERT INTO ttblhyperlink
          (
            BitID,
            Hyperlink
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // ALBUMS
      // ======================================================

      const cleanAlbums =
        Array.isArray(albums)

          ? albums.filter(
              album =>
                album &&
                album.album
            )

          : [];

      if (cleanAlbums.length > 0) {

        const values =
          cleanAlbums.map(
            album => [

              bitID,

              album.album,

              album.track || null

            ]
          );

        await query(

          `
          INSERT INTO ttblalbum
          (
            BitID,
            AlbumID,
            Album_Track
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SUCCESS
      // ======================================================

      res.status(200).json({

        message:
          "Bit inserted successfully",

        bitID

      });

    } catch (err) {

      console.error(
        "BIT INSERT ERROR:",
        err
      );

      res.status(500).json({

        error:
          "Failed to insert bit",

        details:
          err.message,

        sqlMessage:
          err.sqlMessage || null,

        code:
          err.code || null

      });

    }

  }
);

// ============================================================
// GET LOOKUP TABLES
// ============================================================

app.get("/api/get/celebrity", (req, res) => {

  db.query(
    "SELECT * FROM tblcelebkey ORDER BY Name ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/subject", (req, res) => {

  db.query(
    "SELECT * FROM tblsubjectkey ORDER BY Subject ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/artist", (req, res) => {

  db.query(
    "SELECT * FROM tblartist ORDER BY Name ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/category", (req, res) => {

  db.query(
    "SELECT * FROM tblcatkey ORDER BY Category ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/sport", (req, res) => {

  db.query(
    "SELECT * FROM tblsportskey ORDER BY Sport ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/season", (req, res) => {

  db.query(
    "SELECT * FROM tblseasonkey ORDER BY sorder, Season",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

app.get("/api/get/album", (req, res) => {

  db.query(
    "SELECT * FROM tblalbumkey ORDER BY Album_Name ASC",

    (err, result) => {

      if (err) {

        return res.status(500).json(err);

      }

      res.json(result);

    }
  );

});

// ============================================================
// LOGIN
// ============================================================

app.post("/api/login", (req, res) => {

  const {
    username,
    password
  } = req.body;

  const sql =
    `
    SELECT userid, role
    FROM tbllogin
    WHERE login = ?
    AND pass = ?
    `;

  db.query(

    sql,

    [
      username,
      password
    ],

    (err, result) => {

      if (err) {

        return res.status(500).json({
          error: err.message
        });

      }

      if (result.length > 0) {

        req.session.user = {

          userid:
            result[0].userid,

          username,

          role:
            result[0].role

        };

        res.json({

          authenticated: true,

          role:
            result[0].role

        });

      } else {

        res.json({
          authenticated: false
        });

      }

    }

  );

});

// ============================================================
// LOGOUT
// ============================================================

app.post("/api/logout", (req, res) => {

  req.session.destroy((err) => {

    if (err) {

      return res.status(500).json({
        error:
          "Failed to logout"
      });

    }

    res.json({
      loggedOut: true
    });

  });

});

// ============================================================
// AUTH CHECK
// ============================================================

app.get("/api/auth/check", (req, res) => {

  if (req.session.user) {

    res.json({

      authenticated: true,

      user:
        req.session.user

    });

  } else {

    res.json({
      authenticated: false
    });

  }

});

// ============================================================
// BIT SEARCH
// ============================================================

app.get(
  "/api/get/:searchBitID/:searchKeyword/:searchType",

  (req, res) => {

    const {

      searchKeyword,

      searchBitID,

      searchType

    } = req.params;

    let sql;
    let params;

    // ========================================================
    // KEYWORD
    // ========================================================

    if (searchType === "Keyword") {

      sql = `
        SELECT
          bits.BitID,
          bits.Title,
          artist.Name,
          bits.ProphetNum,
          bits.Time,
          bits.Type

        FROM tblbits bits

        LEFT JOIN tblartist artist
          ON bits.ArtistID = artist.ArtistID

        WHERE LOCATE(?, bits.Title) > 0

        ORDER BY bits.BitID DESC
      `;

      params = [
        searchKeyword
      ];

    }

    // ========================================================
    // BIT ID
    // ========================================================

    else if (searchType === "Bit ID") {

      sql = `
        SELECT
          bits.BitID,
          bits.Title,
          artist.Name,
          bits.ProphetNum,
          bits.Time,
          bits.Type

        FROM tblbits bits

        LEFT JOIN tblartist artist
          ON bits.ArtistID = artist.ArtistID

        WHERE bits.BitID = ?
      `;

      params = [
        searchBitID
      ];

    }

    // ========================================================
    // ARTIST
    // ========================================================

    else if (searchType === "Artist") {

      sql = `
        SELECT
          bits.BitID,
          bits.Title,
          artist.Name,
          bits.ProphetNum,
          bits.Time,
          bits.Type

        FROM tblbits bits

        LEFT JOIN tblartist artist
          ON bits.ArtistID = artist.ArtistID

        WHERE LOCATE(?, artist.Name) > 0

        ORDER BY bits.BitID DESC
      `;

      params = [
        searchKeyword
      ];

    }

    else {

      return res.status(400).json({
        error:
          "Invalid search type"
      });

    }

    db.query(
      sql,
      params,

      (err, result) => {

        if (err) {

          console.error(
            "BIT SEARCH ERROR:",
            err
          );

          return res.status(500).json({
            error:
              "Database error"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// GET BIT FOR EDIT
// ============================================================

app.get(
  "/api/get/bit/edit/:bitID",

  async (req, res) => {

    const bitID =
      req.params.bitID;

    if (!bitID) {

      return res.status(400).json({
        error:
          "BitID is required"
      });

    }

    try {

      // ======================================================
      // MAIN BIT
      // ======================================================

      const bitResult =
        await query(

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
          error:
            "Bit not found"
        });

      }

      const bit =
        bitResult[0];

      // ======================================================
      // ALL RELATIONSHIP TABLES
      // ======================================================

      const [

        categoryResult,

        subjectResult,

        celebrityResult,

        sportResult,

        seasonResult,

        keywordResult,

        hyperlinkResult,

        albumResult

      ] = await Promise.all([

        query(
          `
          SELECT CatID
          FROM ttblcategory
          WHERE BitID = ?
          ORDER BY CatID
          `,
          [bitID]
        ),

        query(
          `
          SELECT SubID
          FROM ttblsubject
          WHERE BitID = ?
          ORDER BY SubID
          `,
          [bitID]
        ),

        query(
          `
          SELECT CelebID
          FROM ttblceleb
          WHERE BitID = ?
          ORDER BY CelebID
          `,
          [bitID]
        ),

        query(
          `
          SELECT SportID
          FROM ttblsports
          WHERE BitID = ?
          ORDER BY SportID
          `,
          [bitID]
        ),

        query(
          `
          SELECT SeasonID
          FROM ttblseason
          WHERE BitID = ?
          ORDER BY SeasonID
          `,
          [bitID]
        ),

        query(
          `
          SELECT Keywords
          FROM ttblkeywords
          WHERE BitID = ?
          `,
          [bitID]
        ),

        query(
          `
          SELECT Hyperlink
          FROM ttblhyperlink
          WHERE BitID = ?
          `,
          [bitID]
        ),

        query(
          `
          SELECT
            AlbumID,
            Album_Track

          FROM ttblalbum

          WHERE BitID = ?

          ORDER BY AlbumID
          `,
          [bitID]
        )

      ]);

      // ======================================================
      // RETURN
      // ======================================================

      res.json({

        bitID:
          bit.BitID,

        type:
          bit.Type || "",

        title:
          bit.Title || "",

        category:
          categoryResult[0]?.CatID || "",

        categories:
          categoryResult.map(
            row => row.CatID
          ),

        artist:
          bit.ArtistID || "",

        date:
          bit.AirDate
            ? new Date(bit.AirDate)
                .toISOString()
                .split("T")[0]
            : "",

        time:
          bit.Time || "",

        autoNum:
          bit.ProphetNum || "",

        subjects:
          subjectResult.map(
            row => row.SubID
          ),

        celebrities:
          celebrityResult.map(
            row => row.CelebID
          ),

        sports:
          sportResult.map(
            row => row.SportID
          ),

        seasons:
          seasonResult.map(
            row => row.SeasonID
          ),

        keywords:
          keywordResult
            .map(row => row.Keywords)
            .join(", "),

        hyperlinks:
          hyperlinkResult.map(
            row => row.Hyperlink
          ),

        albums:
          albumResult.map(
            row => ({

              album:
                row.AlbumID,

              track:
                row.Album_Track || ""

            })
          )

      });

    } catch (err) {

      console.error(
        "GET BIT EDIT ERROR:",
        err
      );

      res.status(500).json({

        error:
          "Failed to load bit",

        details:
          err.message

      });

    }

  }
);

// ============================================================
// GET COMPLETE BIT INFORMATION
// ============================================================

app.get(
  "/api/get/bit/full/:bitID",

  async (req, res) => {

    const bitID =
      req.params.bitID;

    if (!bitID) {

      return res.status(400).json({
        error:
          "BitID is required"
      });

    }

    try {

      const bitResult =
        await query(

          `
          SELECT
            b.BitID,
            b.Title,
            b.ProphetNum,
            b.AirDate,
            b.Time,
            b.Type,
            b.ArtistID,
            a.Name AS ArtistName

          FROM tblbits b

          LEFT JOIN tblartist a
            ON b.ArtistID = a.ArtistID

          WHERE b.BitID = ?
          `,

          [bitID]

        );

      if (bitResult.length === 0) {

        return res.status(404).json({
          error:
            "Bit not found"
        });

      }

      const bit =
        bitResult[0];

      const [

        categories,

        subjects,

        celebrities,

        sports,

        seasons,

        keywords,

        hyperlinks,

        albums

      ] = await Promise.all([

        query(

          `
          SELECT
            ck.Category

          FROM ttblcategory tc

          JOIN tblcatkey ck
            ON tc.CatID = ck.CatID

          WHERE tc.BitID = ?

          ORDER BY ck.Category
          `,

          [bitID]

        ),

        query(

          `
          SELECT
            sk.Subject

          FROM ttblsubject ts

          JOIN tblsubjectkey sk
            ON ts.SubID = sk.SubID

          WHERE ts.BitID = ?

          ORDER BY sk.Subject
          `,

          [bitID]

        ),

        query(

          `
          SELECT
            ck.Name

          FROM ttblceleb tc

          JOIN tblcelebkey ck
            ON tc.CelebID = ck.CelebID

          WHERE tc.BitID = ?

          ORDER BY ck.Name
          `,

          [bitID]

        ),

        query(

          `
          SELECT
            sk.Sport

          FROM ttblsports ts

          JOIN tblsportskey sk
            ON ts.SportID = sk.SportID

          WHERE ts.BitID = ?

          ORDER BY sk.Sport
          `,

          [bitID]

        ),

        query(

          `
          SELECT
            sk.Season

          FROM ttblseason ts

          JOIN tblseasonkey sk
            ON ts.SeasonID = sk.SeasonID

          WHERE ts.BitID = ?

          ORDER BY sk.sorder
          `,

          [bitID]

        ),

        query(

          `
          SELECT Keywords

          FROM ttblkeywords

          WHERE BitID = ?
          `,

          [bitID]

        ),

        query(

          `
          SELECT Hyperlink

          FROM ttblhyperlink

          WHERE BitID = ?

          ORDER BY Hyperlink
          `,

          [bitID]

        ),

        query(

          `
          SELECT
            ak.Album_Name,
            ta.Album_Track

          FROM ttblalbum ta

          JOIN tblalbumkey ak
            ON ta.AlbumID = ak.AlbumID

          WHERE ta.BitID = ?

          ORDER BY ak.Album_Name
          `,

          [bitID]

        )

      ]);

      res.json({

        bitID:
          bit.BitID,

        title:
          bit.Title || "",

        type:
          bit.Type || "",

        artist:
          bit.ArtistName || "",

        artistID:
          bit.ArtistID || "",

        date:
          bit.AirDate || "",

        time:
          bit.Time || "",

        autoNum:
          bit.ProphetNum || "",

        categories:
          categories.map(
            row => row.Category
          ),

        subjects:
          subjects.map(
            row => row.Subject
          ),

        celebrities:
          celebrities.map(
            row => row.Name
          ),

        sports:
          sports.map(
            row => row.Sport
          ),

        seasons:
          seasons.map(
            row => row.Season
          ),

        keywords:
          keywords.map(
            row => row.Keywords
          ),

        hyperlinks:
          hyperlinks.map(
            row => row.Hyperlink
          ),

        albums:
          albums.map(
            row => ({

              album:
                row.Album_Name,

              track:
                row.Album_Track

            })
          )

      });

    } catch (err) {

      console.error(
        "FULL BIT GET ERROR:",
        err
      );

      res.status(500).json({

        error:
          "Failed to retrieve complete bit information",

        details:
          err.message

      });

    }

  }
);

// ============================================================
// UPDATE COMPLETE BIT
// ============================================================

app.post(
  "/api/update/bit",

  async (req, res) => {

    const {

      bitID,

      type,

      title,

      category,

      categories = [],

      artist,

      date,

      time,

      autoNum,

      subjects = [],

      celebrities = [],

      celebrity1,

      celebrity2,

      sport,

      sports = [],

      season,

      seasons = [],

      keywords,

      hyperlinks = [],

      albums = []

    } = req.body;

    if (!bitID) {

      return res.status(400).json({
        error:
          "BitID is required"
      });

    }

    try {

      // ======================================================
      // UPDATE MAIN BIT
      // ======================================================

      await query(

        `
        UPDATE tblbits

        SET

          AirDate = ?,

          Title = ?,

          ArtistID = ?,

          ProphetNum = ?,

          Time = ?,

          Type = ?

        WHERE BitID = ?
        `,

        [

          date || null,

          title || null,

          artist || null,

          autoNum || null,

          time || null,

          type || null,

          bitID

        ]

      );

      // ======================================================
      // DELETE OLD RELATIONSHIPS
      // ======================================================

      await Promise.all([

        query(
          "DELETE FROM ttblcategory WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblsubject WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblceleb WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblsports WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblseason WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblkeywords WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblhyperlink WHERE BitID = ?",
          [bitID]
        ),

        query(
          "DELETE FROM ttblalbum WHERE BitID = ?",
          [bitID]
        )

      ]);

      // ======================================================
      // CATEGORIES
      // ======================================================

      let cleanCategories =
        Array.isArray(categories)
          ? [...new Set(categories.filter(Boolean))]
          : [];

      if (
        cleanCategories.length === 0 &&
        category
      ) {

        cleanCategories.push(category);

      }

      if (cleanCategories.length > 0) {

        const values =
          cleanCategories.map(
            catID => [
              bitID,
              catID
            ]
          );

        await query(

          `
          INSERT INTO ttblcategory
          (
            BitID,
            CatID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SUBJECTS
      // ======================================================

      const cleanSubjects =
        Array.isArray(subjects)

          ? [...new Set(
              subjects.filter(Boolean)
            )]

          : [];

      if (cleanSubjects.length > 0) {

        const values =
          cleanSubjects.map(
            subID => [
              bitID,
              subID
            ]
          );

        await query(

          `
          INSERT INTO ttblsubject
          (
            BitID,
            SubID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // CELEBRITIES
      // ======================================================

      let cleanCelebrities =
        Array.isArray(celebrities)

          ? celebrities.filter(Boolean)

          : [];

      // Backwards compatibility

      if (
        cleanCelebrities.length === 0
      ) {

        cleanCelebrities =
          [
            celebrity1,
            celebrity2
          ].filter(Boolean);

      }

      cleanCelebrities =
        [...new Set(cleanCelebrities)];

      if (cleanCelebrities.length > 0) {

        const values =
          cleanCelebrities.map(
            celebID => [
              bitID,
              celebID
            ]
          );

        await query(

          `
          INSERT INTO ttblceleb
          (
            BitID,
            CelebID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SPORTS
      // ======================================================

      let cleanSports =
        Array.isArray(sports)
          ? [...new Set(sports.filter(Boolean))]
          : [];

      if (
        cleanSports.length === 0 &&
        sport
      ) {

        cleanSports.push(sport);

      }

      if (cleanSports.length > 0) {

        const values =
          cleanSports.map(
            sportID => [
              bitID,
              sportID
            ]
          );

        await query(

          `
          INSERT INTO ttblsports
          (
            BitID,
            SportID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // SEASONS
      // ======================================================

      let cleanSeasons =
        Array.isArray(seasons)
          ? [...new Set(seasons.filter(Boolean))]
          : [];

      if (
        cleanSeasons.length === 0 &&
        season
      ) {

        cleanSeasons.push(season);

      }

      if (cleanSeasons.length > 0) {

        const values =
          cleanSeasons.map(
            seasonID => [
              bitID,
              seasonID
            ]
          );

        await query(

          `
          INSERT INTO ttblseason
          (
            BitID,
            SeasonID
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // KEYWORDS
      // ======================================================

      if (
        keywords &&
        String(keywords).trim() !== ""
      ) {

        await query(

          `
          INSERT INTO ttblkeywords
          (
            BitID,
            Keywords
          )
          VALUES (?, ?)
          `,

          [

            bitID,

            String(keywords).trim()

          ]

        );

      }

      // ======================================================
      // HYPERLINKS
      // ======================================================

      const cleanHyperlinks =
        Array.isArray(hyperlinks)

          ? hyperlinks
              .filter(
                link =>
                  link &&
                  String(link).trim() !== ""
              )
              .map(
                link =>
                  String(link).trim()
              )

          : [];

      if (cleanHyperlinks.length > 0) {

        const values =
          cleanHyperlinks.map(
            link => [
              bitID,
              link
            ]
          );

        await query(

          `
          INSERT INTO ttblhyperlink
          (
            BitID,
            Hyperlink
          )
          VALUES ?
          `,

          [values]

        );

      }

      // ======================================================
      // ALBUMS
      // ======================================================

      const cleanAlbums =
        Array.isArray(albums)

          ? albums.filter(
              album =>
                album &&
                album.album
            )

          : [];

      if (cleanAlbums.length > 0) {

        const values =
          cleanAlbums.map(
            album => [

              bitID,

              album.album,

              album.track || null

            ]
          );

        await query(

          `
          INSERT INTO ttblalbum
          (
            BitID,
            AlbumID,
            Album_Track
          )
          VALUES ?
          `,

          [values]

        );

      }

      res.json({

        message:
          "Bit updated successfully",

        bitID

      });

    } catch (err) {

      console.error(
        "UPDATE BIT ERROR:",
        err
      );

      res.status(500).json({

        error:
          "Failed to update bit",

        details:
          err.message,

        sqlMessage:
          err.sqlMessage || null,

        code:
          err.code || null

      });

    }

  }
);

// ============================================================
// RUN SHEET SEARCH
// ============================================================

app.get(
  "/api/get/log/:searchKeyword/:searchArtist/:searchDate/:searchType",

  (req, res) => {

    const {

      searchKeyword,

      searchArtist,

      searchDate,

      searchType

    } = req.params;

    let sql;
    let params;

    if (searchType === "Artist") {

      sql = `

        SELECT

          tblrunentries.bitDesc,

          tblrunentries.bTime,

          tblartist.Name,

          tblrunsheetdate.RSDate,

          tblrunsheetdate.RS_ID

        FROM tblrunentries

        INNER JOIN tblrunkey

          ON tblrunentries.L_ID =
             tblrunkey.L_ID

        INNER JOIN tblrunsheetdate

          ON tblrunkey.RS_ID =
             tblrunsheetdate.RS_ID

        INNER JOIN tblartist

          ON tblrunentries.ArtistID =
             tblartist.ArtistID

        WHERE tblrunentries.ArtistID = ?

      `;

      params = [
        searchArtist
      ];

    }

    else if (searchType === "Date") {

      sql = `

        SELECT

          tblartist.Name,

          tblartist.ArtistID,

          tblrunentries.bTime,

          tblrunentries.L_ID,

          tblrunentries.bitDesc,

          tblrunsheetdate.RS_ID,

          tblrunsheetdate.RSDate

        FROM tblartist

        INNER JOIN tblrunentries

          ON tblrunentries.ArtistID =
             tblartist.ArtistID

        INNER JOIN tblrunkey

          ON tblrunkey.L_ID =
             tblrunentries.L_ID

        INNER JOIN tblrunsheetdate

          ON tblrunsheetdate.RS_ID =
             tblrunkey.RS_ID

        WHERE LOCATE(
          ?,
          tblrunsheetdate.RSDate
        ) > 0

      `;

      params = [
        searchDate
      ];

    }

    else if (
      searchType === "Keyword" ||
      searchType === "keyword"
    ) {

      sql = `

        SELECT

          tblartist.Name,

          tblartist.ArtistID,

          tblrunentries.bTime,

          tblrunentries.L_ID,

          tblrunentries.bitDesc,

          tblrunsheetdate.RS_ID,

          tblrunsheetdate.RSDate

        FROM tblrunentries

        JOIN tblrunkey

          ON tblrunentries.L_ID =
             tblrunkey.L_ID

        JOIN tblrunsheetdate

          ON tblrunkey.RS_ID =
             tblrunsheetdate.RS_ID

        JOIN tblartist

          ON tblrunentries.ArtistID =
             tblartist.ArtistID

        WHERE LOCATE(
          ?,
          tblrunentries.bitDesc
        ) > 0

      `;

      params = [
        searchKeyword
      ];

    }

    else {

      return res.status(400).json({
        error:
          "Invalid search type"
      });

    }

    db.query(

      sql,

      params,

      (err, result) => {

        if (err) {

          console.error(
            "LOG SEARCH ERROR:",
            err
          );

          return res.status(500).json({
            error:
              "Database error"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// GET RUN SHEET
// ============================================================

app.get(
  "/api/get/runSheet/:RS_ID",

  (req, res) => {

    const RS_ID =
      req.params.RS_ID;

    const sql = `

      SELECT

        rk.RS_ID,

        rsd.RSDate,

        e.L_ID,

        e.bTime,

        e.bitDesc,

        e.ArtistID

      FROM tblrunkey rk

      JOIN tblrunentries e
        ON rk.L_ID = e.L_ID

      JOIN tblrunsheetdate rsd
        ON rk.RS_ID = rsd.RS_ID

      WHERE rk.RS_ID = ?

      ORDER BY e.bTime ASC

    `;

    db.query(

      sql,

      [RS_ID],

      (err, result) => {

        if (err) {

          console.error(err);

          return res.status(500).json({
            error:
              "Database error"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// GET LOG DETAILS
// ============================================================

app.get(
  "/api/get/log/details/:RS_ID",

  (req, res) => {

    const RS_ID =
      req.params.RS_ID;

    const sql = `

      SELECT

        k.RS_ID,

        d.RSDate,

        e.bTime,

        e.bitDesc,

        a.Name AS ArtistName

      FROM tblrunkey k

      JOIN tblrunentries e
        ON k.L_ID = e.L_ID

      JOIN tblrunsheetdate d
        ON k.RS_ID = d.RS_ID

      LEFT JOIN tblartist a
        ON e.ArtistID = a.ArtistID

      WHERE k.RS_ID = ?

      ORDER BY e.bTime ASC

    `;

    db.query(

      sql,

      [RS_ID],

      (err, result) => {

        if (err) {

          console.error(err);

          return res.status(500).json({
            error:
              "Failed to fetch log details"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// ARTIST ROUTES
// ============================================================

app.post(
  "/artist/",

  (req, res) => {

    const name =
      req.body.name;

    db.query(

      `
      INSERT INTO tblartist
      (Name)
      VALUES (?)
      `,

      [name],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to insert artist"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/artist",

  (req, res) => {

    const id =
      req.body.deleteArtist;

    db.query(

      `
      DELETE FROM tblartist
      WHERE ArtistID = ?
      `,

      [id],

      (err) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete artist"
          });

        }

        res.json({
          message:
            "Artist deleted"
        });

      }

    );

  }
);

// ============================================================
// CELEBRITY ROUTES
// ============================================================

app.get(
  "/api/get/celebrities",

  (req, res) => {

    db.query(

      `
      SELECT *
      FROM tblcelebkey
      ORDER BY Name
      `,

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to get celebrities"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/celebrity",

  (req, res) => {

    const name =
      req.body.name;

    db.query(

      `
      INSERT INTO tblcelebkey
      (Name)
      VALUES (?)
      `,

      [name],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to add celebrity"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/celebrity",

  (req, res) => {

    const celebID =
      req.body.deleteCelebrity;

    db.query(

      `
      DELETE FROM tblcelebkey
      WHERE CelebID = ?
      `,

      [celebID],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete celebrity"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// SEASON ROUTES
// ============================================================

app.get(
  "/api/get/seasons",

  (req, res) => {

    db.query(

      `
      SELECT *
      FROM tblseasonkey
      ORDER BY sorder, Season
      `,

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to get seasons"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/insert/season",

  (req, res) => {

    const season =
      req.body.season;

    db.query(

      `
      INSERT INTO tblseasonkey
      (Season)
      VALUES (?)
      `,

      [season],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to insert season"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/season",

  (req, res) => {

    const id =
      req.body.deleteSeason;

    db.query(

      `
      DELETE FROM tblseasonkey
      WHERE SeasonID = ?
      `,

      [id],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete season"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// SPORT ROUTES
// ============================================================

app.get(
  "/api/get/sports",

  (req, res) => {

    db.query(

      `
      SELECT *
      FROM tblsportskey
      ORDER BY Sport
      `,

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to get sports"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/insert/sport",

  (req, res) => {

    const sport =
      req.body.sport;

    db.query(

      `
      INSERT INTO tblsportskey
      (Sport)
      VALUES (?)
      `,

      [sport],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to insert sport"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/sport",

  (req, res) => {

    const id =
      req.body.deleteSport;

    db.query(

      `
      DELETE FROM tblsportskey
      WHERE SportID = ?
      `,

      [id],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete sport"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// SUBJECT ROUTES
// ============================================================

app.get(
  "/api/get/subjects",

  (req, res) => {

    db.query(

      `
      SELECT *
      FROM tblsubjectkey
      ORDER BY Subject
      `,

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to get subjects"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/insert/subject",

  (req, res) => {

    const subject =
      req.body.subject;

    db.query(

      `
      INSERT INTO tblsubjectkey
      (Subject)
      VALUES (?)
      `,

      [subject],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to insert subject"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/subject",

  (req, res) => {

    const id =
      req.body.deleteSubject;

    db.query(

      `
      DELETE FROM tblsubjectkey
      WHERE SubID = ?
      `,

      [id],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete subject"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// ALBUM ROUTES
// ============================================================

app.get(
  "/api/get/albums",

  (req, res) => {

    db.query(

      `
      SELECT *
      FROM tblalbumkey
      ORDER BY Album_Name
      `,

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to get albums"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/insert/album",

  (req, res) => {

    const album =
      req.body.album;

    db.query(

      `
      INSERT INTO tblalbumkey
      (Album_Name)
      VALUES (?)
      `,

      [album],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to insert album"
          });

        }

        res.json(result);

      }

    );

  }
);

app.post(
  "/api/delete/album",

  (req, res) => {

    const id =
      req.body.deleteAlbum;

    db.query(

      `
      DELETE FROM tblalbumkey
      WHERE AlbumID = ?
      `,

      [id],

      (err, result) => {

        if (err) {

          return res.status(500).json({
            error:
              "Failed to delete album"
          });

        }

        res.json(result);

      }

    );

  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,

  "0.0.0.0",

  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);
