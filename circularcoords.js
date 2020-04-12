const DEFAULT_PRIME_FIELD = 41; // Field for homology

class CircularCoords {

    // TODO: Have this class add on menu options to the tda instance

    /**
     * A constructor for a circular coordinate instance
     * 
     * @param {TDA} tda A handle to the TDA object
     * @param {DOM Element} canvas2D A canvas to which to draw the results
     * @param {String} dgmsCanvasName The string of the canvas on which to plot
     *                                the interactive persistence diagrams
     * @param {int} nlandmarks The number of landmarks to use
     * @param {int} prime The homology coefficient field
     * @param {int} maxdim The maximum dimension of homology
     */
    constructor(tda, canvas2D, dgmsCanvasName, nlandmarks, prime, maxdim) {
        if (nlandmarks === undefined) {
            nlandmarks = 100;
        }
        if (prime === undefined) {
            prime = DEFAULT_PRIME_FIELD;
        }
        if (maxdim === undefined) {
            maxdim = 1;
        }

        this.tda = tda;
        this.rips = new Ripser(tda, prime, maxdim, true);
        this.rips.nlandmarks = nlandmarks;
        this.ripsPromise = null;
        this.dgmsCanvasName = dgmsCanvasName;
        this.canvas2D = canvas2D;

        // Circular coordinate options
        this.doWeighted = false;
        this.cocyle_idx = [];
        this.perc = 0.99;

        this.setupMenu();
    }

    /**
     * Setup the menu for circular coordinate options
     */
    setupMenu() {
        const gui = this.tda.gui;
        let ccOpts = gui.addFolder('Circular Coordinates');

        // Rips options and computation are separate from other options
        let ripsOpts = ccOpts.addFolder('Rips Options');
        ripsOpts.add(this.rips, 'field').min(2).step(1);
        ripsOpts.add(this.rips, 'homdim').min(1).step(1);
        ripsOpts.landmarksListener = ripsOpts.add(this.rips, 'nlandmarks').min(1).step(1); 
        ripsOpts.add(this, 'recomputeRips');
        this.ripsOpts = ripsOpts;

        ccOpts.add(this, 'perc').min(0).max(1).step(0.01);
        ccOpts.add(this, 'doWeighted');
        ccOpts.add(this, 'updateCoordinates');
        this.ccOpts = ccOpts;

    }

    /**
     * Load in a point cloud and compute rips with the 
     * current parameters
     * 
     * @param {list} X A list of lists of coordinates in a Euclidean point cloud
     */
    addEuclideanPointCloud() {
        this.X = this.tda.points;
        this.ripsPromise = this.rips.computeRipsPC(X, this.rips.nlandmarks);
    }

    /**
     * If the user has chosen different parameters for
     * rips, then recompute
     */
    recomputeRips() {
        if (this.X === undefined) {
            alert("Point cloud not loaded in yet");
        }
        else {
            this.ripsPromise = this.rips.computeRipsPC(this.X, this.rips.nlandmarks);
        }
    }

    /**
      * Perform circular coordinates via persistent cohomology of 
      * sparse filtrations (Jose Perea 2018)
     */
    updateCoordinates() {
        if (this.cocyle_idx.length == 0) {
            alert("Must choose at least one representative cocycle");
            return;
        }
        if (this.X === undefined) {
            alert("Point cloud not loaded in yet");
            return;
        }
        if (this.ripsPromise === null) {
            alert("Rips computation has not been initiated yet");
            return;
        }

        let that = this;
        this.ripsPromise.then(function() {
            let nlandmarks = that.rips.nlandmarks;
            this.ripsOpts.landmarksListener.updateDisplay();

            let dgm1 = that.rips.dgms[1];
            let dist_land_land = that.rips.dist_land_land;
            let dist_land_data = that.rips.dist_land_data;

            // Step 1: Come up with the representative cocycle as a formal sum
            // of the chosen cocycles
            cohomdeath = null;
            cohombirth = null;
            let cocycle = [];
            let prime = that.rips.field;
            for (idx of cocycle_idx) {
                cocycle = addCochains(cocycle, that.rips.cocycles1[idx], prime);
                if (cohomdeath === null) {
                    cohomdeath = dgm1.births[idx];
                    cohombirth = dgm1.deaths[idx];
                }
                else {
                    cohomdeath = Math.max(cohomdeath, dgm1.births[idx]);
                    cohombirth = Math.min(cohombirth, dgm1.deaths[idx]);
                }
            }
            
            // Step 2: Determine radius for balls
            // coverage = np.max(np.min(dist_land_data, 1))
            let coverage = 0.0;
            for (let i = 0; i < dist_land_data.length; i++) {
                let row = dist_land_data[i];
                if (row.length > 0) {
                    let min = row[0];
                    for (let i = 1; i < row.length; i++) {
                        if (row[i] < min) {
                            min = row[i];
                        }
                    }
                    if (min > coverage) {
                        coverage = min;
                    }
                }
            }
            let r_cover = (1-perc)*Math.max(cohomdeath, coverage) + perc*cohombirth;
            that.r_cover = r_cover // Store covering radius for reference
            
            
            // Step 3: Setup coboundary matrix, delta_0, for Cech_{r_cover }
            // and use it to find a projection of the cocycle
            // onto the image of delta0

            // Lift to integer cocycle
            for (let i = 0; i < cocycle.length; i++) {
                let vidx = cocycle[i].length-1;
                if (cocycle[i][vidx] > (prime-1)/2) {
                    cocycle[i][vidx] -= prime;
                }
            }

            /*
            Y = np.zeros((nlandmarks, nlandmarks))
            Y[cocycle[:, 0], cocycle[:, 1]] = val
            Y = Y + Y.T
            #Select edges that are under the threshold
            [I, J] = np.meshgrid(np.arange(nlandmarks), np.arange(nlandmarks))
            I = I[np.triu_indices(nlandmarks, 1)]
            J = J[np.triu_indices(nlandmarks, 1)]
            Y = Y[np.triu_indices(nlandmarks, 1)]
            idx = np.arange(len(I))
            idx = idx[dist_land_land[I, J] < 2*r_cover]
            I = I[idx]
            J = J[idx]
            Y = Y[idx]

            NEdges = len(I)
            R = np.zeros((NEdges, 2))
            R[:, 0] = J
            R[:, 1] = I
            #Make a flat array of NEdges weights parallel to the rows of R
            if do_weighted:
                W = dist_land_land[I, J]
            else:
                W = np.ones(NEdges)
            delta0 = make_delta0(R)
            wSqrt = np.sqrt(W).flatten()
            WSqrt = scipy.sparse.spdiags(wSqrt, 0, len(W), len(W))
            A = WSqrt*delta0
            b = WSqrt.dot(Y)
            tau = lsqr(A, b)[0]
            theta = np.zeros((NEdges, 3))
            theta[:, 0] = J
            theta[:, 1] = I
            theta[:, 2] = -delta0.dot(tau)
            theta = add_cocycles(cocycle, theta, real=True)
            
            /*
            ## Step 4: Create the open covering U = {U_1,..., U_{s+1}} and partition of unity
            U = dist_land_data < r_cover
            phi = np.zeros_like(dist_land_data)
            phi[U] = partunity_fn(phi[U], r_cover)
            # Compute the partition of unity 
            # varphi_j(b) = phi_j(b)/(phi_1(b) + ... + phi_{nlandmarks}(b))
            denom = np.sum(phi, 0)
            nzero = np.sum(denom == 0)
            if nzero > 0:
                warnings.warn("There are %i point not covered by a landmark"%nzero)
                denom[denom == 0] = 1
            varphi = phi / denom[None, :]

            # To each data point, associate the index of the first open set it belongs to
            ball_indx = np.argmax(U, 0)

            ## Step 5: From U_1 to U_{s+1} - (U_1 \cup ... \cup U_s), apply classifying map
            
            # compute all transition functions
            theta_matrix = np.zeros((nlandmarks, nlandmarks))
            I = np.array(theta[:, 0], dtype = np.int64)
            J = np.array(theta[:, 1], dtype = np.int64)
            theta = theta[:, 2]
            theta = np.mod(theta + 0.5, 1) - 0.5
            theta_matrix[I, J] = theta
            theta_matrix[J, I] = -theta
            class_map = -tau[ball_indx]
            for i in range(n_data):
                class_map[i] += theta_matrix[ball_indx[i], :].dot(varphi[:, i])    
            thetas = np.mod(2*np.pi*class_map, 2*np.pi)

            return thetas**/
        });

    }



}
