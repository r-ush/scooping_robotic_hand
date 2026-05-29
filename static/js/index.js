window.HELP_IMPROVE_VIDEOJS = false;

$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");
    });

    var options = {
        slidesToScroll: 1,
        slidesToShow: 3,
        loop: true,
        infinite: true,
        autoplay: false,
        autoplaySpeed: 3000,
    }

    // Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
        carousels[i].on('before:show', state => {
            console.log(state);
        });
    }

    bulmaSlider.attach();

    // Synchronize video pairs
    function syncVideos(withId, withoutId) {
        var withVideo = document.getElementById(withId);
        var withoutVideo = document.getElementById(withoutId);

        console.log('Syncing videos:', withId, withoutId);

        if (withVideo && withoutVideo) {
            var isSyncing = false;

            // When the 'with' video plays, also play the 'without' video
            withVideo.addEventListener('play', function() {
                if (!isSyncing) {
                    isSyncing = true;
                    withoutVideo.play().catch(function(e) { console.error('Play error:', e); });
                    isSyncing = false;
                }
            });

            // When the 'with' video pauses, also pause the 'without' video
            withVideo.addEventListener('pause', function() {
                if (!isSyncing) {
                    isSyncing = true;
                    withoutVideo.pause();
                    isSyncing = false;
                }
            });

            // When the 'with' video seeks, sync the 'without' video
            withVideo.addEventListener('seeked', function() {
                if (!isSyncing) {
                    isSyncing = true;
                    withoutVideo.currentTime = withVideo.currentTime;
                    isSyncing = false;
                }
            });

            // Click on 'with' video to play both from start
            withVideo.addEventListener('click', function() {
                withVideo.currentTime = 0;
                withoutVideo.currentTime = 0;
                withVideo.play().catch(function(e) { console.error('Play error:', e); });
            });

            // Click on 'without' video to play both from start
            withoutVideo.addEventListener('click', function() {
                withVideo.currentTime = 0;
                withoutVideo.currentTime = 0;
                withVideo.play().catch(function(e) { console.error('Play error:', e); });
            });

            // Add pointer cursor to indicate clickability
            withVideo.style.cursor = 'pointer';
            withoutVideo.style.cursor = 'pointer';
        } else {
            console.error('Could not find videos:', withId, withoutId);
        }
    }

    // Sync the scooping comparison video pair
    syncVideos('comparison1-with', 'comparison1-without');

})
